`ldap_helper.py`

- **Purpose**: Provides functionality for interacting with LDAP servers.

- **Key Classes**:
  - `LDAPHelper`: Manages LDAP connections and operations.

- **Key Methods**:
  - `connect()`: Connects to the LDAP server using user-provided credentials.
  - `get_computers(ldap_filter: str, ou: Optional[str])`: Retrieves a list of computers from the LDAP server.

- **Notes**: Handles authentication and querying of LDAP directories.