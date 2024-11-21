import typer
from scanner import ShareScanner
from ldap_helper import LDAPHelper
from db_helper import DatabaseHelper
from config import Config
from rich.console import Console
import getpass

app = typer.Typer()
console = Console()

def get_credentials():
    """Get username and password interactively"""
    print("\nPlease enter domain credentials (example: domain\\username):")
    username = input("Username: ")
    password = getpass.getpass("Password: ")
    return username, password

@app.command()
def main(
    dc: str = typer.Option(..., "--dc", help="Domain controller hostname or IP"),
    domain: str = typer.Option(..., "--domain", help="Domain name (e.g., company.local)"),
    ldap_port: int = typer.Option(389, "--port", help="LDAP port number"),
    threads: int = typer.Option(10, "--threads", help="Number of concurrent scan threads (default: 10)"),
    ou: str = typer.Option(None, "--ou", help="Specific OU to scan"),
    filter: str = typer.Option("all", "--filter", help="LDAP filter for computer search"),
    batch_size: int = typer.Option(1000, "--batch-size", help="Number of hosts to process in each batch")
):
    """
    Share Scanner - Enumerate and analyze network shares
    """
    try:
        # Get credentials once
        username, password = get_credentials()
        print(f"\nAttempting to connect as: {username}")

        # Initialize configuration with credentials
        config = Config(
            LDAP_SERVER=dc,
            LDAP_DOMAIN=domain,
            LDAP_PORT=ldap_port,
            DEFAULT_THREADS=threads,
            BATCH_SIZE=batch_size
        )
        config.set_credentials(username, password)

        # Initialize helpers
        ldap_helper = LDAPHelper(config)
        db_helper = DatabaseHelper(config)
        db_helper.connect()  # Initialize the connection pool
        db_helper.init_tables()  # Initialize database tables
        scanner = ShareScanner(config, db_helper)

        # Connect to LDAP using stored credentials
        ldap_helper.connect_with_stored_credentials()

        # Get computers list
        computers = ldap_helper.get_computers(ldap_filter=filter, ou=ou)

        if not computers:
            console.print("[red]No computers found![/red]")
            return

        # Start scanning
        scanner.scan_network(computers)

    except Exception as e:
        console.print(f"[red]Error: {str(e)}[/red]")
        raise

if __name__ == "__main__":
    app()