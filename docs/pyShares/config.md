`config.py`

- **Purpose**: Contains configuration settings for the application using a dataclass.

- **Key Classes**:
  - `Config`: Holds configuration parameters for LDAP, database, and scanning settings.

- **Key Methods**:
  - `set_credentials(username: str, password: str)`: Sets runtime credentials for LDAP.

- **Notes**: Loads environment variables for configuration settings.