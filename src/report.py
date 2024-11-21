import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress
from rich.syntax import Syntax
from rich.prompt import Prompt
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv
from pathlib import Path

app = typer.Typer(help="Share Scanner Report Interface")
console = Console()

class ReportGenerator:
    def __init__(self):
        # Load environment variables
        env_path = Path('.') / '.env'
        load_dotenv(dotenv_path=env_path)
        
        # Get database credentials from environment
        self.db_config = {
            'dbname': os.getenv('POSTGRES_DB', 'shares'),
            'user': os.getenv('POSTGRES_USER', 'admin'),
            'password': os.getenv('POSTGRES_PASSWORD'),
            'host': os.getenv('POSTGRES_HOST', 'localhost'),
            'port': os.getenv('POSTGRES_PORT', '5432')
        }
        
        # Validate configuration
        if not self.db_config['password']:
            raise ValueError("Database password not found in .env file")
        
        try:
            self.conn = psycopg2.connect(**self.db_config)
            console.print("[green]Successfully connected to database[/green]")
        except Exception as e:
            console.print(f"[red]Database connection error: {str(e)}[/red]")
            raise
    
    def execute_query(self, query: str) -> list:
        """Execute query and return results as dict"""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            return cur.fetchall()

    def shares_overview(self):
        """Display overview of all shares"""
        query = """
        SELECT 
            hostname,
            share_name,
            access_level,
            total_files,
            total_dirs,
            hidden_files,
            scan_time
        FROM 
            shares
        ORDER BY 
            hostname, share_name;
        """
        
        results = self.execute_query(query)
        
        table = Table(title="Shares Overview")
        table.add_column("Hostname", style="cyan")
        table.add_column("Share Name", style="green")
        table.add_column("Access", style="yellow")
        table.add_column("Files", justify="right")
        table.add_column("Dirs", justify="right")
        table.add_column("Hidden", justify="right")
        table.add_column("Scan Time", style="magenta")
        
        for row in results:
            table.add_row(
                str(row['hostname']),
                str(row['share_name']),
                str(row['access_level']),
                str(row['total_files']),
                str(row['total_dirs']),
                str(row['hidden_files']),
                str(row['scan_time'])
            )
        
        console.print(table)

    def sensitive_files_report(self):
        """Display shares with sensitive files"""
        query = """
        SELECT 
            s.hostname,
            s.share_name,
            sf.file_path,
            sf.file_name,
            sf.detection_type
        FROM 
            shares s
        JOIN 
            sensitive_files sf ON s.id = sf.share_id
        ORDER BY 
            s.hostname, s.share_name;
        """
        
        results = self.execute_query(query)
        
        table = Table(title="[red]Sensitive Files Found[/red]")
        table.add_column("Hostname", style="cyan")
        table.add_column("Share", style="green")
        table.add_column("Path", style="yellow")
        table.add_column("Filename", style="red")
        table.add_column("Detection Type", style="magenta")
        
        for row in results:
            table.add_row(
                str(row['hostname']),
                str(row['share_name']),
                str(row['file_path']),
                str(row['file_name']),
                str(row['detection_type'])
            )
        
        console.print(Panel.fit(table, title="Sensitive Files Report", border_style="red"))

    def access_summary(self):
        """Display access level summary"""
        query = """
        SELECT 
            access_level,
            COUNT(*) as share_count,
            array_agg(DISTINCT share_name) as share_names
        FROM 
            shares
        GROUP BY 
            access_level
        ORDER BY 
            share_count DESC;
        """
        
        results = self.execute_query(query)
        
        table = Table(title="Access Levels Summary")
        table.add_column("Access Level", style="cyan")
        table.add_column("Share Count", style="green")
        table.add_column("Share Names", style="yellow")
        
        for row in results:
            table.add_row(
                str(row['access_level']),
                str(row['share_count']),
                str(row['share_names'])
            )
        
        console.print(table)

    def large_files_report(self):
        """Display large files found"""
        query = """
        SELECT 
            s.hostname,
            s.share_name,
            rf.file_name,
            rf.file_size / (1024*1024.0) as size_mb
        FROM 
            shares s
        JOIN 
            root_files rf ON s.id = rf.share_id
        WHERE 
            rf.file_size > 1024*1024
        ORDER BY 
            rf.file_size DESC
        LIMIT 20;
        """
        
        results = self.execute_query(query)
        
        table = Table(title="Large Files (>1MB)")
        table.add_column("Hostname", style="cyan")
        table.add_column("Share", style="green")
        table.add_column("Filename", style="yellow")
        table.add_column("Size (MB)", style="red")
        
        for row in results:
            table.add_row(
                str(row['hostname']),
                str(row['share_name']),
                str(row['file_name']),
                f"{row['size_mb']:.2f}"
            )
        
        console.print(table)

def main_menu():
    """Display main menu and handle user input"""
    while True:
        console.clear()
        console.print(Panel.fit(
            "[cyan]Share Scanner Report Interface[/cyan]\n\n"
            "1. [green]Shares Overview[/green]\n"
            "2. [red]Sensitive Files Report[/red]\n"
            "3. [yellow]Access Summary[/yellow]\n"
            "4. [magenta]Large Files Report[/magenta]\n"
            "5. [blue]Export All Reports[/blue]\n"
            "6. [red]Exit[/red]",
            title="Main Menu",
            border_style="cyan"
        ))
        
        choice = Prompt.ask("Select an option", choices=["1", "2", "3", "4", "5", "6"])
        
        report = ReportGenerator()
        
        if choice == "1":
            report.shares_overview()
        elif choice == "2":
            report.sensitive_files_report()
        elif choice == "3":
            report.access_summary()
        elif choice == "4":
            report.large_files_report()
        elif choice == "5":
            export_reports(report)
        elif choice == "6":
            console.print("[yellow]Goodbye![/yellow]")
            break
        
        input("\nPress Enter to continue...")

def export_reports(report: ReportGenerator):
    """Export all reports to files"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    export_dir = f"reports_{timestamp}"
    os.makedirs(export_dir, exist_ok=True)
    
    with Progress() as progress:
        task = progress.add_task("[cyan]Exporting reports...", total=4)
        
        # Export shares overview
        with open(f"{export_dir}/shares_overview.csv", 'w') as f:
            results = report.execute_query("""
                SELECT * FROM shares ORDER BY hostname, share_name
            """)
            if results:
                f.write(",".join(results[0].keys()) + "\n")
                for row in results:
                    f.write(",".join(str(v) for v in row.values()) + "\n")
        progress.advance(task)
        
        # Export sensitive files
        with open(f"{export_dir}/sensitive_files.csv", 'w') as f:
            results = report.execute_query("""
                SELECT s.hostname, s.share_name, sf.* 
                FROM shares s
                JOIN sensitive_files sf ON s.id = sf.share_id
            """)
            if results:
                f.write(",".join(results[0].keys()) + "\n")
                for row in results:
                    f.write(",".join(str(v) for v in row.values()) + "\n")
        progress.advance(task)
        
        # Export root files
        with open(f"{export_dir}/root_files.csv", 'w') as f:
            results = report.execute_query("""
                SELECT s.hostname, s.share_name, rf.* 
                FROM shares s
                JOIN root_files rf ON s.id = rf.share_id
            """)
            if results:
                f.write(",".join(results[0].keys()) + "\n")
                for row in results:
                    f.write(",".join(str(v) for v in row.values()) + "\n")
        progress.advance(task)
        
        # Export summary
        with open(f"{export_dir}/summary.txt", 'w') as f:
            results = report.execute_query("""
                SELECT access_level, COUNT(*) as count 
                FROM shares 
                GROUP BY access_level
            """)
            f.write("Access Level Summary:\n")
            for row in results:
                f.write(f"{row['access_level']}: {row['count']} shares\n")
        progress.advance(task)
    
    console.print(f"\n[green]Reports exported to {export_dir}/[/green]")

if __name__ == "__main__":
    try:
        main_menu()
    except KeyboardInterrupt:
        console.print("\n[yellow]Goodbye![/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {str(e)}[/red]") 