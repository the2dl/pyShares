`db_helper.py`

- **Purpose**: Provides helper functions for database interactions, including table initialization and data storage.

- **Key Classes**:
  - `DatabaseHelper`: Manages database connections and operations.

- **Key Methods**:
  - `init_tables()`: Initializes necessary database tables.
  - `start_scan_session(domain: str)`: Starts a new scan session in the database.
  - `end_scan_session(session_id: int, total_hosts: int, total_shares: int, total_sensitive: int)`: Marks a scan session as complete.

- **Notes**: Uses psycopg2 for PostgreSQL database interactions.