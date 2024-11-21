from impacket.smbconnection import SMBConnection, SessionError
from concurrent.futures import ThreadPoolExecutor
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

class ShareScanner:
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

    def scan_host(self, hostname: str) -> Dict:
        ip = self.resolve_host(hostname)
        if not ip:
            return {'success': False, 'error': 'Could not resolve hostname', 'hostname': hostname}

        try:
            smb = SMBConnection(ip, ip)

            # Try authentication methods
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
            try:
                share_list = smb.listShares()

                for share in share_list:
                    share_name = share['shi1_netname'][:-1]

                    if share_name in self.config.DEFAULT_EXCLUDED_SHARES:
                        continue

                    access_level, error_msg = self.determine_access_level(smb, share_name)
                    share_detail = ShareDetails(hostname, share_name, access_level)

                    if access_level in [ShareAccess.FULL_ACCESS, ShareAccess.READ_ONLY]:
                        root_info = self.scan_share_root(smb, share_name)
                        if root_info:
                            share_detail.root_files = root_info['root_listing']
                            share_detail.total_files = root_info['total_files']
                            share_detail.total_dirs = root_info['total_dirs']
                            share_detail.hidden_files = root_info['hidden_files']

                        share_detail.share_permissions = self.get_share_permissions(smb, share_name)

                        if self.config.SCAN_FOR_SENSITIVE:
                            share_detail.sensitive_files = self.scan_share_for_sensitive(smb, share_name)

                    shares_details.append(share_detail)

            except Exception as share_e:
                return {'success': False, 'error': f'Error listing shares: {str(share_e)}', 'hostname': hostname}

            return {'success': True, 'shares': shares_details}

        except Exception as e:
            return {'success': False, 'error': str(e), 'hostname': hostname}

    def scan_share_for_sensitive(self, smb, share_name: str, path: str = '') -> List[Dict]:
        sensitive_files = []
        try:
            files = smb.listPath(share_name, f'{path}/*')
            for file in files:
                if file.get_longname() in ['.', '..']:
                    continue

                full_path = os.path.join(path, file.get_longname())

                if file.is_directory():
                    # Recursively scan subdirectories
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
        except SessionError:
            pass  # Handle permission errors silently

        return sensitive_files

    def scan_network(self, hosts: List[str]) -> None:
        valid_hosts = [h for h in hosts if h and h != "[]"]
        total_hosts = len(valid_hosts)
        
        total_shares_processed = 0
        total_sensitive_files = 0
        storage_batch = []
        storage_batch_size = 1000
        
        for i in range(0, total_hosts, self.batch_size):
            batch = valid_hosts[i:i + self.batch_size]
            
            with ThreadPoolExecutor(max_workers=self.config.DEFAULT_THREADS) as executor:
                future_to_host = {executor.submit(self.scan_host, host): host
                                for host in batch}
                
                completed = 0
                for future in future_to_host:
                    try:
                        result = future.result()
                        completed += 1
                        
                        if result['success'] and 'shares' in result:
                            storage_batch.extend(result['shares'])
                            
                            if len(storage_batch) >= storage_batch_size:
                                try:
                                    shares_count, sensitive_count = self.db_helper.store_results(storage_batch)
                                    total_shares_processed += shares_count
                                    total_sensitive_files += sensitive_count
                                    storage_batch = []
                                except Exception as e:
                                    print(f"Error storing batch results: {str(e)}")
                                    
                    except Exception as e:
                        continue
        
        # Store any remaining results
        if storage_batch:
            try:
                shares_count, sensitive_count = self.db_helper.store_results(storage_batch)
                total_shares_processed += shares_count
                total_sensitive_files += sensitive_count
            except Exception as e:
                print(f"Error storing final batch results: {str(e)}")
        
        print(f"Scan complete:")
        print(f"Total shares processed: {total_shares_processed}")
        print(f"Total sensitive files found: {total_sensitive_files}")

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