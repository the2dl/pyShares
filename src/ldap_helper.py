from ldap3 import Server, Connection, SUBTREE, ALL, NTLM, SIMPLE, Tls, ALL_ATTRIBUTES, ANONYMOUS
from typing import List, Optional
import ssl
from config import Config
import sys
import socket
import getpass

class LDAPHelper:
    def __init__(self, config: Config):
        self.config = config
        self.conn = None

    def format_domain_user(self, username: str) -> str:
        """Format username correctly for NTLM authentication"""
        if '\\' in username:
            # Already in correct format
            return username
        elif '@' in username:
            # Convert user@domain.com to DOMAIN\user
            user, domain = username.split('@')
            return f"{domain.split('.')[0].upper()}\\{user}"
        else:
            # Add domain prefix
            return f"{self.config.LDAP_DOMAIN.split('.')[0].upper()}\\{username}"

    def connect(self):
        try:
            if not self.config.LDAP_SERVER:
                raise ValueError("LDAP server not specified. Use --dc parameter.")
            if not self.config.LDAP_DOMAIN:
                raise ValueError("Domain not specified. Use --domain parameter.")

            # Get credentials interactively
            print("\nPlease enter domain credentials:")
            username = input("Username: ")
            password = getpass.getpass("Password: ")

            server = Server(
                self.config.LDAP_SERVER,
                get_info=ALL,
                use_ssl=False,
                port=self.config.LDAP_PORT
            )

            # Format the username for NTLM
            domain_user = self.format_domain_user(username)
            print(f"\nAttempting to connect as: {domain_user}")

            self.conn = Connection(
                server,
                user=domain_user,
                password=password,
                authentication=NTLM,
                auto_bind=False
            )

            # Try to bind and show detailed error if it fails
            if not self.conn.bind():
                print(f"\nBind failed!")
                print(f"Result: {self.conn.result}")
                raise Exception(f"Bind failed: {self.conn.result}")

            print("Authentication successful!")

            # Test the connection with a simple query
            test_success = self.conn.search(
                self.get_base_dn(),
                '(objectClass=domain)',
                SUBTREE,
                attributes=['dc']
            )

            if test_success:
                print("Successfully queried domain information")
                print(f"Domain entries found: {len(self.conn.entries)}")
            else:
                print("Warning: Could not query domain information")
                print(f"Last error: {self.conn.last_error}")

        except Exception as e:
            print(f"\nAuthentication failed: {str(e)}", file=sys.stderr)
            print("\nDebug information:", file=sys.stderr)
            print(f"Server IP: {self.config.LDAP_SERVER}", file=sys.stderr)
            print(f"Domain: {self.config.LDAP_DOMAIN}", file=sys.stderr)
            print(f"Attempted user: {domain_user}", file=sys.stderr)
            raise

    def connect_with_stored_credentials(self):
        """Connect using credentials stored in config"""
        try:
            if not self.config.LDAP_SERVER:
                raise ValueError("LDAP server not specified. Use --dc parameter.")
            if not self.config.LDAP_DOMAIN:
                raise ValueError("Domain not specified. Use --domain parameter.")

            server = Server(
                self.config.LDAP_SERVER,
                get_info=ALL,
                use_ssl=False,
                port=self.config.LDAP_PORT
            )

            # Use stored credentials from config
            domain_user = self.config.LDAP_USER
            password = self.config.LDAP_PASSWORD

            self.conn = Connection(
                server,
                user=domain_user,
                password=password,
                authentication=NTLM,
                auto_bind=False
            )

            # Try to bind and show detailed error if it fails
            if not self.conn.bind():
                print(f"\nBind failed!")
                print(f"Result: {self.conn.result}")
                raise Exception(f"Bind failed: {self.conn.result}")

            print("Authentication successful!")

            # Test the connection with a simple query
            test_success = self.conn.search(
                self.get_base_dn(),
                '(objectClass=domain)',
                SUBTREE,
                attributes=['dc']
            )

            if test_success:
                print("Successfully queried domain information")
                print(f"Domain entries found: {len(self.conn.entries)}")
            else:
                print("Warning: Could not query domain information")
                print(f"Last error: {self.conn.last_error}")

        except Exception as e:
            print(f"\nAuthentication failed: {str(e)}", file=sys.stderr)
            print("\nDebug information:", file=sys.stderr)
            print(f"Server IP: {self.config.LDAP_SERVER}", file=sys.stderr)
            print(f"Domain: {self.config.LDAP_DOMAIN}", file=sys.stderr)
            print(f"Attempted user: {domain_user}", file=sys.stderr)
            raise

    def get_base_dn(self) -> str:
        """Convert domain to base DN format"""
        return ','.join([f"DC={part}" for part in self.config.LDAP_DOMAIN.split('.')])

    def get_computers(self, ldap_filter: str = "all", ou: Optional[str] = None) -> List[str]:
        try:
            base_dn = self.get_base_dn()
            if ou:
                base_dn = f"{ou},{base_dn}"

            print(f"\nUsing base DN: {base_dn}")

            # Try a very basic filter first
            search_filter = "(objectClass=computer)"

            print(f"Using search filter: {search_filter}")
            print("Executing LDAP search...")

            # Increase page size for large directories
            PAGE_SIZE = 5000
            
            entry_list = []
            entry_generator = self.conn.extend.standard.paged_search(
                search_base=base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=['dNSHostName', 'name'],  # Minimize attributes
                paged_size=PAGE_SIZE,
                generator=True
            )
            
            # Process in batches
            batch = []
            for entry in entry_generator:
                if 'attributes' in entry:
                    hostname = entry['attributes'].get('dNSHostName') or entry['attributes'].get('name')
                    if hostname:
                        batch.append(str(hostname))
                        
                    if len(batch) >= PAGE_SIZE:
                        entry_list.extend(batch)
                        print(f"Processed {len(entry_list)} computers...")
                        batch = []
                        
            if batch:
                entry_list.extend(batch)

            print(f"\nFound {len(entry_list)} computers")
            if entry_list:
                print("First few computers found:")
                for comp in entry_list[:5]:
                    print(f"  - {comp}")

            return entry_list

        except Exception as e:
            print(f"\nError during computer search: {str(e)}", file=sys.stderr)
            print(f"Last error from LDAP: {self.conn.last_error}", file=sys.stderr)
            print(f"Response: {self.conn.result}", file=sys.stderr)
            raise