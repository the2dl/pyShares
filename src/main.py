import typer
from scanner import ShareScanner
from ldap_helper import LDAPHelper
from db_helper import DatabaseHelper
from config import Config
from rich.console import Console
import getpass
from typing import Optional
import signal
import sys
from contextlib import contextmanager
import time

app = typer.Typer()
console = Console()

class TimeoutError(Exception):
    pass

@contextmanager
def timeout(seconds: int):
    """Context manager for timeout handling"""
    def signal_handler(signum, frame):
        raise TimeoutError(f"Operation timed out after {seconds} seconds")
    
    # Register signal handler
    signal.signal(signal.SIGALRM, signal_handler)
    signal.alarm(seconds)
    
    try:
        yield
    finally:
        # Disable alarm
        signal.alarm(0)

def get_credentials(max_attempts: int = 3) -> tuple[str, str]:
    """Get username and password interactively with retry limit"""
    attempts = 0
    while attempts < max_attempts:
        try:
            print("\nPlease enter domain credentials (example: domain\\username):")
            username = input("Username: ").strip()
            if not username or '\\' not in username:
                console.print("[yellow]Invalid format. Please use domain\\username format.[/yellow]")
                attempts += 1
                continue
                
            password = getpass.getpass("Password: ")
            if not password:
                console.print("[yellow]Password cannot be empty.[/yellow]")
                attempts += 1
                continue
                
            return username, password
            
        except (KeyboardInterrupt, EOFError):
            console.print("\n[yellow]Operation cancelled by user.[/yellow]")
            sys.exit(1)
            
    console.print("[red]Maximum authentication attempts exceeded.[/red]")
    sys.exit(1)

def validate_inputs(dc: str, domain: str, threads: int, batch_size: int, 
                   max_depth: int, scan_timeout: int, host_timeout: int) -> None:
    """Validate input parameters"""
    if threads < 1 or threads > 100:
        raise ValueError("Thread count must be between 1 and 100")
    if batch_size < 1:
        raise ValueError("Batch size must be positive")
    if max_depth < 1 or max_depth > 10:
        raise ValueError("Max depth must be between 1 and 10")
    if scan_timeout < 1 or host_timeout < 1:
        raise ValueError("Timeout values must be positive")
    if not dc or not domain:
        raise ValueError("DC and domain parameters are required")

@app.command()
def main(
    dc: str = typer.Option(..., "--dc", help="Domain controller hostname or IP"),
    domain: str = typer.Option(..., "--domain", help="Domain name (e.g., company.local)"),
    ldap_port: int = typer.Option(389, "--port", help="LDAP port number"),
    threads: int = typer.Option(10, "--threads", help="Number of concurrent scan threads (default: 10)"),
    ou: Optional[str] = typer.Option(None, "--ou", help="Specific OU to scan"),
    filter: str = typer.Option("all", "--filter", help="LDAP filter for computer search"),
    batch_size: int = typer.Option(1000, "--batch-size", help="Number of hosts to process in each batch"),
    max_depth: int = typer.Option(5, "--max-depth", help="Maximum directory depth to scan (default: 5)"),
    scan_timeout: int = typer.Option(30, "--scan-timeout", help="Timeout for individual share scans in seconds (default: 30)"),
    host_timeout: int = typer.Option(300, "--host-timeout", help="Timeout for entire host scan in seconds (default: 300)"),
    max_computers: int = typer.Option(800000, "--max-computers", 
        help="Maximum number of computers to process (default: 800000)")
):
    """
    Share Scanner - Enumerate and analyze network shares
    """
    start_time = time.time()
    
    try:
        # Validate input parameters
        validate_inputs(dc, domain, threads, batch_size, max_depth, scan_timeout, host_timeout)
        
        # Get credentials with retry mechanism
        username, password = get_credentials()
        console.print(f"\nAttempting to connect as: {username}")

        # Initialize configuration with credentials
        config = Config(
            LDAP_SERVER=dc,
            LDAP_DOMAIN=domain,
            LDAP_PORT=ldap_port,
            DEFAULT_THREADS=threads,
            BATCH_SIZE=batch_size,
            MAX_SCAN_DEPTH=max_depth,
            SCAN_TIMEOUT=scan_timeout,
            HOST_SCAN_TIMEOUT=host_timeout,
            MAX_COMPUTERS=max_computers
        )
        config.set_credentials(username, password)

        # Initialize helpers with connection timeout
        try:
            with timeout(30):  # 30-second timeout for initial connections
                ldap_helper = LDAPHelper(config)
                db_helper = DatabaseHelper(config)
                db_helper.connect()
                db_helper.init_tables()
                scanner = ShareScanner(config, db_helper)
        except TimeoutError:
            raise ConnectionError("Timed out while establishing initial connections")

        # Connect to LDAP with timeout
        try:
            with timeout(30):
                ldap_helper.connect_with_stored_credentials()
        except TimeoutError:
            raise ConnectionError("LDAP connection timed out")

        # Get computers list with timeout
        try:
            with timeout(60):  # 60-second timeout for LDAP query
                computers = ldap_helper.get_computers(ldap_filter=filter, ou=ou)
        except TimeoutError:
            raise ConnectionError("LDAP query timed out")

        if not computers:
            console.print("[yellow]No computers found![/yellow]")
            return

        # Validate computer list
        if len(computers) > 10000:  # Arbitrary limit, adjust as needed
            console.print(f"[yellow]Warning: Large number of computers found ({len(computers)}). "
                        f"This might take a while.[/yellow]")
            if not typer.confirm("Do you want to continue?"):
                return

        # Start a new scan session
        session_id = db_helper.start_scan_session(domain)
        console.print(f"[green]Started scan session {session_id} for domain {domain}[/green]")

        # Modify scanner initialization to include session_id
        scanner = ShareScanner(config, db_helper, session_id)

        try:
            with console.status("[bold green]Scanning network shares...") as status:
                total_hosts = len(computers)
                scanner.scan_network(computers)
                
                # Update scan session with final statistics
                db_helper.end_scan_session(
                    session_id,
                    total_hosts=total_hosts,
                    total_shares=scanner.total_shares_processed,
                    total_sensitive=scanner.total_sensitive_files
                )
                
        except KeyboardInterrupt:
            console.print("\n[yellow]Scan interrupted by user. Cleaning up...[/yellow]")
            # Update scan session as interrupted
            db_helper.end_scan_session(
                session_id,
                total_hosts=len(computers),
                total_shares=scanner.total_shares_processed,
                total_sensitive=scanner.total_sensitive_files
            )
            sys.exit(1)

    except ValueError as ve:
        console.print(f"[red]Configuration Error: {str(ve)}[/red]")
        sys.exit(1)
    except ConnectionError as ce:
        console.print(f"[red]Connection Error: {str(ce)}[/red]")
        sys.exit(1)
    except Exception as e:
        console.print(f"[red]Unexpected Error: {str(e)}[/red]")
        console.print_exception()
        sys.exit(1)
    finally:
        # Cleanup and display summary
        try:
            db_helper.close()
        except:
            pass
        
        elapsed_time = time.time() - start_time
        console.print(f"\n[green]Scan completed in {elapsed_time:.2f} seconds[/green]")

if __name__ == "__main__":
    app()