from impacket.smbconnection import SMBConnection, SessionError
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Set
import csv
from datetime import datetime
import os
from pattern_matcher import PatternMatcher
import socket
from config import Config
from db_helper import DatabaseHelper
from models import ShareAccess, ShareResult
from dataclasses import dataclass
from enum import Enum
import json
import concurrent.futures
import signal
from functools import wraps
from typing import Callable, Any
import threading
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TimeElapsedColumn
import time
import queue

# SMB File Attributes Constants
ATTR_READONLY = 0x1
ATTR_HIDDEN = 0x2
ATTR_DIRECTORY = 0x10

class ShareAccess(Enum):
    FULL_ACCESS = "Full Access"
    READ_ONLY = "Read Only"
    DENIED = "Access Denied"
    ERROR = "Error"

@dataclass
class ShareResult:
    hostname: str
    share_name: str
    access_level: ShareAccess
    error_message: Optional[str] = None
    sensitive_files: List[Dict] = None
    scan_time: str = None

class ShareDetails:
    def __init__(self, hostname: str, share_name: str, access_level: ShareAccess):
        self.hostname = hostname
        self.share_name = share_name
        self.access_level = access_level
        self.error_message = None
        self.root_files = []  # List of files/folders in root
        self.share_permissions = []  # SMB permissions
        self.total_files = 0  # Count of files in root
        self.total_dirs = 0   # Count of directories in root
        self.hidden_files = 0 # Count of hidden files
        self.sensitive_files = []
        self.scan_time = datetime.now().isoformat()

    def to_dict(self):
        return {
            'hostname': self.hostname,
            'share_name': self.share_name,
            'access_level': self.access_level.value,
            'error_message': self.error_message,
            'root_files': self.root_files,
            'share_permissions': self.share_permissions,
            'total_files': self.total_files,
            'total_dirs': self.total_dirs,
            'hidden_files': self.hidden_files,
            'sensitive_files': self.sensitive_files,
            'scan_time': self.scan_time
        }

class TimeoutError(Exception):
    pass

def with_timeout(seconds: int) -> Callable:
    """Thread-safe timeout decorator"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            result = []
            error = []
            
            def target():
                try:
                    result.append(func(*args, **kwargs))
                except Exception as e:
                    error.append(e)
            
            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()
            thread.join(seconds)
            
            if thread.is_alive():
                return {'success': False, 'error': f'Operation timed out after {seconds} seconds'}
            
            if error:
                return {'success': False, 'error': str(error[0])}
            
            if result:
                return result[0]
            
            return {'success': False, 'error': 'Operation completed with no result'}
            
        return wrapper
    return decorator

class ShareScanner:
    console = Console()  # Class-level console

    def __init__(self, config: Config, db_helper: DatabaseHelper):
        self.config = config
        self.db_helper = db_helper
        self.pattern_matcher = PatternMatcher()
        self.share_stats = {
            ShareAccess.FULL_ACCESS: set(),
            ShareAccess.READ_ONLY: set(),
            ShareAccess.DENIED: set(),
            ShareAccess.ERROR: set()
        }
        self.batch_size = 1000
        self._cancel_event = threading.Event()

    def resolve_host(self, hostname: str) -> Optional[str]:
        """Resolve hostname to IP address"""
        try:
            # Remove empty hostnames
            if not hostname or hostname == "[]":
                return None

            # If it's already an IP, return it
            try:
                socket.inet_aton(hostname)
                return hostname
            except socket.error:
                pass

            # Try to resolve the hostname
            ip = socket.gethostbyname(hostname)
            return ip
        except socket.gaierror:
            return None

    def determine_access_level(self, smb, share_name: str) -> tuple[ShareAccess, Optional[str]]:
        """Determine the access level for a share"""
        try:
            # Try to list files
            smb.listPath(share_name, '*')

            # Try to create a test file to check write access
            test_file = f"test_{datetime.now().strftime('%Y%m%d%H%M%S')}.tmp"
            try:
                smb.createFile(share_name, test_file)
                smb.deleteFile(share_name, test_file)
                return ShareAccess.FULL_ACCESS, None
            except SessionError:
                return ShareAccess.READ_ONLY, None

        except SessionError as se:
            if "STATUS_ACCESS_DENIED" in str(se):
                return ShareAccess.DENIED, str(se)
            else:
                return ShareAccess.ERROR, str(se)
        except Exception as e:
            return ShareAccess.ERROR, str(e)

    def get_file_attributes(self, file_data) -> dict:
        """Convert file attributes to human-readable format"""
        attrs = []

        # Get file attributes
        if file_data.is_directory():
            attrs.append('DIR')
        if file_data.is_readonly():
            attrs.append('READ_ONLY')

        # Some files might not have all timestamps
        try:
            created_time = datetime.fromtimestamp(file_data.get_ctime()).strftime('%Y-%m-%d %H:%M:%S')
        except:
            created_time = None

        try:
            modified_time = datetime.fromtimestamp(file_data.get_mtime()).strftime('%Y-%m-%d %H:%M:%S')
        except:
            modified_time = None

        return {
            'name': file_data.get_longname(),
            'type': 'Directory' if 'DIR' in attrs else 'File',
            'size': file_data.get_filesize(),
            'attributes': attrs,
            'created': created_time,
            'modified': modified_time
        }

    def scan_share_root(self, smb, share_name: str) -> dict:
        """Scan root directory of share for initial enumeration"""
        try:
            root_listing = []
            total_files = 0
            total_dirs = 0
            hidden_files = 0

            for file_data in smb.listPath(share_name, '*'):
                name = file_data.get_longname()
                if name in ['.', '..']:
                    continue

                try:
                    file_info = self.get_file_attributes(file_data)
                    root_listing.append(file_info)

                    if file_info['type'] == 'Directory':
                        total_dirs += 1
                    else:
                        total_files += 1

                    if 'HIDDEN' in file_info.get('attributes', []):
                        hidden_files += 1

                except Exception as e:
                    print(f"Error processing file {name} in {share_name}: {str(e)}")
                    continue

            return {
                'root_listing': root_listing[:20],  # Limit to first 20 entries
                'total_files': total_files,
                'total_dirs': total_dirs,
                'hidden_files': hidden_files
            }
        except Exception as e:
            print(f"Error scanning root of {share_name}: {str(e)}")
            return None

    def get_share_permissions(self, smb, share_name: str) -> list:
        """Get share permissions if possible"""
        try:
            # This is a basic implementation - could be enhanced with more detailed ACL info
            perms = []
            try:
                smb.createFile(share_name, "test_write_access.tmp")
                smb.deleteFile(share_name, "test_write_access.tmp")
                perms.append("WRITE")
            except:
                pass

            try:
                smb.listPath(share_name, "*")
                perms.append("READ")
            except:
                pass

            return perms
        except Exception as e:
            print(f"Error getting permissions for {share_name}: {str(e)}")
            return []

    def scan_share_for_sensitive(self, smb, share_name: str, path: str = '') -> List[Dict]:
        """Scan share with cancellation support"""
        if self._cancel_event.is_set():
            raise ScanCancelled("Scan cancelled")
            
        sensitive_files = []
        try:
            max_depth = self.config.MAX_SCAN_DEPTH
            current_depth = len(path.split(os.sep))
            
            if current_depth > max_depth:
                return sensitive_files
                
            files = smb.listPath(share_name, f'{path}/*')
            for file in files:
                if self._cancel_event.is_set():
                    raise ScanCancelled("Scan cancelled")
                    
                if file.get_longname() in ['.', '..']:
                    continue

                full_path = os.path.join(path, file.get_longname())
                
                if file.is_directory():
                    sensitive_files.extend(self.scan_share_for_sensitive(smb, share_name, full_path))
                else:
                    matches = self.pattern_matcher.check_filename(file.get_longname())
                    if matches:
                        for match_type, description in matches:
                            sensitive_files.append({
                                'path': full_path,
                                'filename': file.get_longname(),
                                'type': match_type,
                                'description': description
                            })
        except ScanCancelled:
            raise
        except Exception as e:
            ShareScanner.console.print(f"[red]Error scanning {path}: {str(e)}[/red]")
        
        return sensitive_files

    def scan_network(self, hosts: List[str]) -> None:
        valid_hosts = [h for h in hosts if h and h != "[]"]
        total_hosts = len(valid_hosts)
        
        ShareScanner.console.print(f"\n[bold]Starting scan of {total_hosts} hosts[/bold]")
        ShareScanner.console.print(f"[bold]Threads:[/bold] {self.config.DEFAULT_THREADS}")
        ShareScanner.console.print(f"[bold]Timeouts:[/bold] Host={self.config.HOST_SCAN_TIMEOUT}s, Share={self.config.SCAN_TIMEOUT}s")
        
        total_shares_processed = 0
        total_sensitive_files = 0
        storage_batch = []
        
        with ShareScanner.console.status("[bold green]Scanning network shares...") as status:
            for i in range(0, total_hosts, self.batch_size):
                batch = valid_hosts[i:i + self.batch_size]
                ShareScanner.console.print(f"\n[cyan]Processing batch {i//self.batch_size + 1} ({len(batch)} hosts)[/cyan]")
                
                with ThreadPoolExecutor(max_workers=self.config.DEFAULT_THREADS) as executor:
                    future_to_host = {
                        executor.submit(self._scan_host_wrapper, host): host 
                        for host in batch
                    }
                    
                    for future in as_completed(future_to_host):
                        host = future_to_host[future]
                        try:
                            result = future.result()
                            
                            if result['success'] and 'shares' in result:
                                shares_count = len(result['shares'])
                                if shares_count > 0:
                                    ShareScanner.console.print(f"[green]✓[/green] {host}: Found {shares_count} shares")
                                    storage_batch.extend(result['shares'])
                                    
                                    # Store results when batch is full
                                    if len(storage_batch) >= self.batch_size:
                                        shares_count, sensitive_count = self.db_helper.store_results(storage_batch)
                                        total_shares_processed += shares_count
                                        total_sensitive_files += sensitive_count
                                        storage_batch = []
                            else:
                                ShareScanner.console.print(f"[red]✗[/red] {host}: {result.get('error', 'Unknown error')}")
                                
                        except Exception as e:
                            ShareScanner.console.print(f"[red]✗[/red] {host}: {str(e)}")

        # Store any remaining results
        if storage_batch:
            try:
                shares_count, sensitive_count = self.db_helper.store_results(storage_batch)
                total_shares_processed += shares_count
                total_sensitive_files += sensitive_count
            except Exception as e:
                ShareScanner.console.print(f"[red]Error storing final results: {str(e)}[/red]")

        ShareScanner.console.print("\n[bold green]Scan Summary:[/bold green]")
        ShareScanner.console.print(f"Total shares processed: {total_shares_processed}")
        ShareScanner.console.print(f"Total sensitive files found: {total_sensitive_files}")

    def write_results_csv(self, results: List[ShareResult]) -> None:
        """Write scan results to CSV file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'share_scan_{timestamp}.csv'

        try:
            with open(filename, 'w', newline='') as csvfile:
                fieldnames = ['hostname', 'share_name', 'access_level', 'error_message',
                             'sensitive_file_path', 'sensitive_file_name', 'detection_type']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

                writer.writeheader()

                for result in results:
                    # If no sensitive files found, write one row with share info
                    if not result.sensitive_files:
                        writer.writerow({
                            'hostname': result.hostname,
                            'share_name': result.share_name,
                            'access_level': result.access_level.value,
                            'error_message': result.error_message,
                            'sensitive_file_path': '',
                            'sensitive_file_name': '',
                            'detection_type': ''
                        })
                    else:
                        # Write a row for each sensitive file
                        for sensitive_file in result.sensitive_files:
                            writer.writerow({
                                'hostname': result.hostname,
                                'share_name': result.share_name,
                                'access_level': result.access_level.value,
                                'error_message': result.error_message,
                                'sensitive_file_path': sensitive_file['path'],
                                'sensitive_file_name': sensitive_file['filename'],
                                'detection_type': sensitive_file['type']
                            })

            print(f"\nResults written to {filename}")

        except Exception as e:
            print(f"Error writing CSV: {str(e)}")

    def print_summary(self):
        """Print summary of share access levels"""
        print("\n=== Share Access Summary ===")
        print(f"Full Access: {len(self.share_stats[ShareAccess.FULL_ACCESS])} shares")
        for share in sorted(self.share_stats[ShareAccess.FULL_ACCESS]):
            print(f"  - {share}")

        print(f"\nRead Only: {len(self.share_stats[ShareAccess.READ_ONLY])} shares")
        for share in sorted(self.share_stats[ShareAccess.READ_ONLY]):
            print(f"  - {share}")

        print(f"\nAccess Denied: {len(self.share_stats[ShareAccess.DENIED])} shares")
        for share in sorted(self.share_stats[ShareAccess.DENIED]):
            print(f"  - {share}")

        print(f"\nErrors: {len(self.share_stats[ShareAccess.ERROR])} shares")
        for share in sorted(self.share_stats[ShareAccess.ERROR]):
            print(f"  - {share}")

    def _timeout_wrapper(self, func, *args, timeout=300):
        """Wrapper to handle timeouts for any function"""
        try:
            with socket.timeout(timeout):
                return func(*args)
        except (socket.timeout, TimeoutError):
            return {
                'success': False,
                'error': f'Operation timed out after {timeout} seconds',
                'hostname': args[0] if args else 'unknown'
            }

    def _scan_share_with_timeout(self, smb, hostname: str, share_name: str) -> Optional[ShareDetails]:
        """Scan a single share with strict timeout"""
        result_queue = queue.Queue()
        
        def scan_worker():
            try:
                access_level, error_msg = self.determine_access_level(smb, share_name)
                ShareScanner.console.print(f"      Access level: {access_level.name}")
                
                share_detail = ShareDetails(hostname, share_name, access_level)
                
                if access_level in [ShareAccess.FULL_ACCESS, ShareAccess.READ_ONLY]:
                    ShareScanner.console.print(f"      Scanning root directory...")
                    
                    root_info = self.scan_share_root(smb, share_name)
                    if root_info:
                        share_detail.root_files = root_info['root_listing']
                        share_detail.total_files = root_info['total_files']
                        share_detail.total_dirs = root_info['total_dirs']
                        share_detail.hidden_files = root_info['hidden_files']
                        ShareScanner.console.print(f"      Found {root_info['total_files']} files, {root_info['total_dirs']} directories")

                    if self.config.SCAN_FOR_SENSITIVE:
                        ShareScanner.console.print(f"      Scanning for sensitive files...")
                        sensitive_result = self.scan_share_for_sensitive(smb, share_name)
                        if isinstance(sensitive_result, list):
                            share_detail.sensitive_files = sensitive_result
                            ShareScanner.console.print(f"      Found {len(sensitive_result)} sensitive files")
                
                result_queue.put(share_detail)
                
            except Exception as e:
                ShareScanner.console.print(f"      [red]Error: {str(e)}[/red]")
                result_queue.put(None)

        # Start the scan in a separate thread
        scan_thread = threading.Thread(target=scan_worker)
        scan_thread.daemon = True
        scan_thread.start()

        try:
            # Wait for result with timeout
            result = result_queue.get(timeout=self.config.SCAN_TIMEOUT)
            return result
        except queue.Empty:
            ShareScanner.console.print(f"      [red]Share scan timed out after {self.config.SCAN_TIMEOUT} seconds[/red]")
            return None
        finally:
            # Cleanup
            if scan_thread.is_alive():
                scan_thread.join(timeout=1.0)

    def scan_host(self, hostname: str) -> Dict:
        """Scan a single host"""
        try:
            ShareScanner.console.print(f"\nScanning host {hostname}")
            ip = self.resolve_host(hostname)
            if not ip:
                return {'success': False, 'error': 'Could not resolve hostname', 'hostname': hostname}

            smb = SMBConnection(ip, ip)
            
            # Try authentication
            try:
                smb.login('', '')
                auth_method = "Null Session"
            except:
                try:
                    domain, username = self.config.LDAP_USER.split('\\')
                    smb.login(username, self.config.LDAP_PASSWORD, domain)
                    auth_method = "Domain Auth"
                except Exception as auth_e:
                    return {'success': False, 'error': f'Authentication failed: {str(auth_e)}', 'hostname': hostname}

            shares_details = []
            share_list = smb.listShares()

            for share in share_list:
                share_name = share['shi1_netname'][:-1]
                if share_name in self.config.DEFAULT_EXCLUDED_SHARES:
                    continue

                ShareScanner.console.print(f"    Scanning share: {share_name}")
                share_result = self._scan_share_with_timeout(smb, hostname, share_name)
                
                if share_result:
                    shares_details.append(share_result)
                    ShareScanner.console.print(f"    ✓ Completed scan of {share_name}")

            return {'success': True, 'shares': shares_details}

        except Exception as e:
            return {'success': False, 'error': str(e), 'hostname': hostname}

    def _scan_host_wrapper(self, hostname: str) -> Dict:
        """Wrapper with timeout and cancellation support"""
        self._cancel_event.clear()
        result_container = []
        
        def target():
            try:
                result = self.scan_host(hostname)
                result_container.append(result)
            except Exception as e:
                result_container.append({
                    'success': False,
                    'error': str(e),
                    'hostname': hostname
                })

        scan_thread = threading.Thread(target=target)
        scan_thread.daemon = True
        scan_thread.start()
        scan_thread.join(timeout=self.config.HOST_SCAN_TIMEOUT)

        if scan_thread.is_alive():
            self._cancel_event.set()  # Signal cancellation
            scan_thread.join(timeout=1.0)  # Give it a second to clean up
            return {
                'success': False,
                'error': f'Operation timed out after {self.config.HOST_SCAN_TIMEOUT} seconds',
                'hostname': hostname
            }

        return result_container[0] if result_container else {
            'success': False,
            'error': 'Scan failed with no result',
            'hostname': hostname
        }