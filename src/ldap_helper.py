from ldap3 import Server, Connection, SUBTREE, ALL, NTLM, SIMPLE, Tls, ALL_ATTRIBUTES, ANONYMOUS
from typing import List, Optional
import ssl
from config import Config
import sys
import socket
import getpass
from contextlib import contextmanager
import time

class LDAPConnectionError(Exception):
    """Custom exception for LDAP connection issues"""
    pass

class LDAPHelper:
    def __init__(self, config: Config):
        self.config = config
        self.conn = None
        self.max_retries = 3
        self.retry_delay = 2  # seconds
        self.search_timeout = 300  # 5 minutes
        self.max_computers = config.MAX_COMPUTERS if hasattr(config, 'MAX_COMPUTERS') else 100000  # Make configurable
        self.page_size = 5000  # Size of each batch during pagination

    @contextmanager
    def ldap_operation_timeout(self, timeout_seconds: int):
        """Context manager for LDAP operations timeout"""
        socket.setdefaulttimeout(timeout_seconds)
        try:
            yield
        finally:
            socket.setdefaulttimeout(None)

    def _retry_operation(self, operation_func, *args, **kwargs):
        """Retry mechanism for LDAP operations"""
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                return operation_func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    print(f"Attempt {attempt + 1} failed, retrying in {self.retry_delay} seconds...")
                    time.sleep(self.retry_delay)
                continue
        raise last_exception

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
        """Connect using credentials stored in config with retry mechanism"""
        try:
            if not self.config.LDAP_SERVER:
                raise ValueError("LDAP server not specified. Use --dc parameter.")
            if not self.config.LDAP_DOMAIN:
                raise ValueError("Domain not specified. Use --domain parameter.")

            def _connect():
                server = Server(
                    self.config.LDAP_SERVER,
                    get_info=ALL,
                    use_ssl=False,
                    port=self.config.LDAP_PORT,
                    connect_timeout=30  # 30 second connection timeout
                )

                domain_user = self.config.LDAP_USER
                password = self.config.LDAP_PASSWORD

                if not domain_user or not password:
                    raise ValueError("Credentials not properly set in configuration")

                self.conn = Connection(
                    server,
                    user=domain_user,
                    password=password,
                    authentication=NTLM,
                    auto_bind=False,
                    receive_timeout=30  # 30 second receive timeout
                )

                if not self.conn.bind():
                    raise LDAPConnectionError(f"Bind failed: {self.conn.result}")

                # Test connection with timeout
                with self.ldap_operation_timeout(30):
                    test_success = self.conn.search(
                        self.get_base_dn(),
                        '(objectClass=domain)',
                        SUBTREE,
                        attributes=['dc']
                    )

                if not test_success:
                    raise LDAPConnectionError(f"Connection test failed: {self.conn.last_error}")

            return self._retry_operation(_connect)

        except Exception as e:
            print(f"\nAuthentication failed: {str(e)}", file=sys.stderr)
            print("\nDebug information:", file=sys.stderr)
            print(f"Server IP: {self.config.LDAP_SERVER}", file=sys.stderr)
            print(f"Domain: {self.config.LDAP_DOMAIN}", file=sys.stderr)
            print(f"Attempted user: {self.config.LDAP_USER}", file=sys.stderr)
            raise

    def get_base_dn(self) -> str:
        """Convert domain to base DN format"""
        return ','.join([f"DC={part}" for part in self.config.LDAP_DOMAIN.split('.')])

    def get_computers(self, ldap_filter: str = "all", ou: Optional[str] = None) -> List[str]:
        """Get computer list with pagination and timeout protection"""
        try:
            # Determine base DN
            if ou:
                # Check if OU already includes domain components
                if 'DC=' in ou.upper():
                    base_dn = ou
                else:
                    # Add OU prefix if not already present
                    if not ou.upper().startswith('OU='):
                        ou = f"OU={ou}"
                    base_dn = f"{ou},{self.get_base_dn()}"
            else:
                base_dn = self.get_base_dn()

            print(f"\nUsing base DN: {base_dn}")
            search_filter = "(objectClass=computer)"
            print(f"Using search filter: {search_filter}")

            entry_list = []
            total_processed = 0
            start_time = time.time()

            with self.ldap_operation_timeout(self.search_timeout):
                entry_generator = self.conn.extend.standard.paged_search(
                    search_base=base_dn,
                    search_filter=search_filter,
                    search_scope=SUBTREE,
                    attributes=['dNSHostName', 'name'],
                    paged_size=self.page_size,
                    generator=True,
                    time_limit=self.search_timeout
                )

                batch = []
                for entry in entry_generator:
                    # Check timeout
                    if time.time() - start_time > self.search_timeout:
                        print("\nWarning: Search operation timed out")
                        break

                    # Check maximum results limit
                    if total_processed >= self.max_computers:
                        print(f"\nWarning: Reached maximum computer limit of {self.max_computers}")
                        break

                    if 'attributes' in entry:
                        hostname = entry['attributes'].get('dNSHostName') or entry['attributes'].get('name')
                        if hostname:
                            batch.append(str(hostname))
                            total_processed += 1

                        if len(batch) >= self.page_size:
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

        except TimeoutError:
            print("\nSearch operation timed out", file=sys.stderr)
            return entry_list  # Return partial results
        except Exception as e:
            print(f"\nError during computer search: {str(e)}", file=sys.stderr)
            print(f"Last error from LDAP: {self.conn.last_error}", file=sys.stderr)
            print(f"Response: {self.conn.result}", file=sys.stderr)
            raise