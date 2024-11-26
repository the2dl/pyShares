import psycopg2
from psycopg2.extras import execute_values
from typing import List, Dict, Optional
from config import Config
from psycopg2.pool import ThreadedConnectionPool
from models import ShareResult
import time
from contextlib import contextmanager

class DatabaseError(Exception):
    """Custom exception for database operations"""
    pass

class DatabaseHelper:
    def __init__(self, config: Config):
        self.config = config
        self.pool = None
        self.max_retries = 3
        self.retry_delay = 2  # seconds
        self.operation_timeout = 30  # seconds
        self.batch_size = 5000  # Maximum records to process in one batch
        
    @contextmanager
    def get_db_connection(self):
        """Context manager for database connections with timeout and retry"""
        conn = None
        try:
            conn = self.get_connection()
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            raise DatabaseError(f"Database operation failed: {str(e)}")
        finally:
            if conn:
                self.return_connection(conn)

    def _retry_operation(self, operation_func, *args, **kwargs):
        """Retry mechanism for database operations"""
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                return operation_func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries - 1:
                    print(f"Database operation failed, attempt {attempt + 1} of {self.max_retries}")
                    time.sleep(self.retry_delay)
                continue
        raise DatabaseError(f"Operation failed after {self.max_retries} attempts: {str(last_exception)}")

    def init_tables(self):
        """Initialize database tables if they don't exist"""
        def _init():
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    # Set statement timeout
                    cur.execute(f"SET statement_timeout = {self.operation_timeout * 1000}")
                    
                    # Create shares table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS shares (
                            id SERIAL PRIMARY KEY,
                            hostname VARCHAR(255) NOT NULL,
                            share_name VARCHAR(255) NOT NULL,
                            access_level VARCHAR(50),
                            error_message TEXT,
                            total_files INTEGER DEFAULT 0,
                            total_dirs INTEGER DEFAULT 0,
                            hidden_files INTEGER DEFAULT 0,
                            scan_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(hostname, share_name, scan_time)
                        )
                    """)

                    # Create share_permissions table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS share_permissions (
                            id SERIAL PRIMARY KEY,
                            share_id INTEGER REFERENCES shares(id) ON DELETE CASCADE,
                            permission VARCHAR(50)
                        )
                    """)

                    # Create root_files table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS root_files (
                            id SERIAL PRIMARY KEY,
                            share_id INTEGER REFERENCES shares(id) ON DELETE CASCADE,
                            file_name VARCHAR(255) NOT NULL,
                            file_type VARCHAR(50),
                            file_size BIGINT,
                            attributes TEXT[],
                            created_time TIMESTAMP,
                            modified_time TIMESTAMP
                        )
                    """)

                    # Create sensitive_files table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS sensitive_files (
                            id SERIAL PRIMARY KEY,
                            share_id INTEGER REFERENCES shares(id) ON DELETE CASCADE,
                            file_path TEXT NOT NULL,
                            file_name VARCHAR(255) NOT NULL,
                            detection_type VARCHAR(50),
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT path_length_check CHECK (length(file_path) <= 4096)
                        )
                    """)

                    # Create sensitive_patterns table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS sensitive_patterns (
                            id SERIAL PRIMARY KEY,
                            pattern VARCHAR(255) NOT NULL,
                            type VARCHAR(50) NOT NULL,
                            description TEXT,
                            enabled BOOLEAN DEFAULT true,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """)

                    # Add index for pattern lookups
                    cur.execute("""
                        CREATE INDEX IF NOT EXISTS idx_sensitive_patterns_type 
                        ON sensitive_patterns(type)
                    """)

                    # Add default patterns if table is empty
                    cur.execute("SELECT COUNT(*) FROM sensitive_patterns")
                    if cur.fetchone()[0] == 0:
                        default_patterns = [
                            ('pass(word|wd)?|secret|credential|key|auth|token|apikey|api.?key', 'credential', 'Credential-related file'),
                            ('ssn|social.*security|tax|ein|itin|passport', 'pii', 'Government ID related'),
                            ('bank|account|routing|swift|iban|credit.*card|debit.*card', 'financial', 'Financial information'),
                            ('salary|payroll|compensation|benefits', 'hr', 'HR/Personnel information'),
                            ('medical|health|diagnosis|patient|rx|prescription', 'health', 'Healthcare information'),
                            ('driver.*license|birth.*certificate|national.*id', 'identity', 'Identity documents'),
                            ('confidential|private|sensitive|restricted|internal', 'classification', 'Explicitly marked sensitive'),
                            ('contract|agreement|nda|legal', 'legal', 'Legal documents'),
                            ('backup|dump|export|archive', 'backup', 'Backup/Export files'),
                            ('config|settings|env|properties', 'configuration', 'Configuration files'),
                            # ... add other default patterns ...
                        ]
                        execute_values(cur, """
                            INSERT INTO sensitive_patterns (pattern, type, description)
                            VALUES %s
                        """, default_patterns)

                    # Create indexes
                    indexes = [
                        "CREATE INDEX IF NOT EXISTS idx_shares_hostname ON shares(hostname)",
                        "CREATE INDEX IF NOT EXISTS idx_shares_scan_time ON shares(scan_time)",
                        "CREATE INDEX IF NOT EXISTS idx_sensitive_files_share_id ON sensitive_files(share_id)",
                        "CREATE INDEX IF NOT EXISTS idx_sensitive_files_detection_type ON sensitive_files(detection_type)"
                    ]

                    for index_sql in indexes:
                        try:
                            cur.execute(index_sql)
                        except Exception as e:
                            print(f"Warning: Index creation failed: {str(e)}")

                    # Create scan_sessions table
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS scan_sessions (
                            id SERIAL PRIMARY KEY,
                            domain VARCHAR(255) NOT NULL,
                            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            end_time TIMESTAMP,
                            total_hosts INTEGER DEFAULT 0,
                            total_shares INTEGER DEFAULT 0,
                            total_sensitive_files INTEGER DEFAULT 0,
                            scan_status VARCHAR(50) DEFAULT 'running'
                        )
                    """)

                    # Modify shares table to include session_id
                    cur.execute("""
                        ALTER TABLE shares 
                        ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES scan_sessions(id) ON DELETE CASCADE
                    """)

                    # Add indexes
                    cur.execute("""
                        CREATE INDEX IF NOT EXISTS idx_shares_session_id ON shares(session_id);
                        CREATE INDEX IF NOT EXISTS idx_scan_sessions_domain ON scan_sessions(domain);
                        CREATE INDEX IF NOT EXISTS idx_scan_sessions_start_time ON scan_sessions(start_time);
                    """)

                    conn.commit()

        return self._retry_operation(_init)

    def connect(self):
        """Initialize the connection pool with retry mechanism"""
        def _connect():
            self.pool = ThreadedConnectionPool(
                self.config.DB_MIN_CONNECTIONS,
                self.config.DB_MAX_CONNECTIONS,
                host=self.config.DB_HOST,
                port=self.config.DB_PORT,
                dbname=self.config.DB_NAME,
                user=self.config.DB_USER,
                password=self.config.DB_PASSWORD,
                connect_timeout=self.operation_timeout
            )
            # Test the connection
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")

        return self._retry_operation(_connect)

    def get_connection(self):
        """Get a connection from the pool"""
        if not self.pool:
            self.connect()
        return self.pool.getconn()

    def return_connection(self, conn):
        """Return a connection to the pool"""
        if self.pool:
            self.pool.putconn(conn)

    def store_results(self, results: List[ShareResult], session_id: int) -> tuple[int, int]:
        """Store scan results in batches with retry mechanism"""
        def _store_batch(batch: List[ShareResult]) -> tuple[int, int]:
            with self.get_db_connection() as conn:
                with conn.cursor() as cur:
                    # Set statement timeout
                    cur.execute(f"SET statement_timeout = {self.operation_timeout * 1000}")
                    
                    stored_count = 0
                    sensitive_count = 0

                    for result in batch:
                        try:
                            # Insert share info with parameter validation
                            hostname = str(result.hostname)[:255]  # Truncate if too long
                            share_name = str(result.share_name)[:255]
                            
                            cur.execute("""
                                INSERT INTO shares
                                (hostname, share_name, access_level, error_message,
                                 total_files, total_dirs, hidden_files, scan_time, session_id)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                RETURNING id
                            """, (
                                hostname,
                                share_name,
                                result.access_level.value,
                                result.error_message,
                                max(0, getattr(result, 'total_files', 0)),  # Ensure non-negative
                                max(0, getattr(result, 'total_dirs', 0)),
                                max(0, getattr(result, 'hidden_files', 0)),
                                result.scan_time,
                                session_id
                            ))

                            share_id = cur.fetchone()[0]
                            stored_count += 1

                            # Add root files storage
                            if hasattr(result, 'root_files') and result.root_files:
                                root_files_batch = []
                                for root_file in result.root_files:
                                    root_files_batch.append((
                                        share_id,
                                        str(root_file['name'])[:255],
                                        root_file['type'],
                                        root_file['size'],
                                        root_file['attributes'],
                                        root_file['created'],
                                        root_file['modified']
                                    ))
                                
                                if root_files_batch:
                                    execute_values(cur, """
                                        INSERT INTO root_files
                                        (share_id, file_name, file_type, file_size, attributes, created_time, modified_time)
                                        VALUES %s
                                    """, root_files_batch)
                                    print(f"Stored {len(root_files_batch)} root files for share {share_id}")

                            # Store sensitive files in batches
                            if result.sensitive_files:
                                sensitive_files_batch = []
                                for sensitive_file in result.sensitive_files:
                                    # Validate and truncate data
                                    file_path = str(sensitive_file['path'])[:4096]
                                    file_name = str(sensitive_file['filename'])[:255]
                                    detection_type = str(sensitive_file['type'])[:50]
                                    
                                    sensitive_files_batch.append(
                                        (share_id, file_path, file_name, detection_type)
                                    )
                                    
                                    if len(sensitive_files_batch) >= self.batch_size:
                                        execute_values(cur, """
                                            INSERT INTO sensitive_files
                                            (share_id, file_path, file_name, detection_type)
                                            VALUES %s
                                        """, sensitive_files_batch)
                                        sensitive_count += len(sensitive_files_batch)
                                        sensitive_files_batch = []
                                
                                if sensitive_files_batch:
                                    execute_values(cur, """
                                        INSERT INTO sensitive_files
                                        (share_id, file_path, file_name, detection_type)
                                        VALUES %s
                                    """, sensitive_files_batch)
                                    sensitive_count += len(sensitive_files_batch)

                        except Exception as e:
                            print(f"Error processing result for {result.hostname}: {str(e)}")
                            continue

                    conn.commit()
                    return stored_count, sensitive_count

        # Process results in batches
        total_stored = 0
        total_sensitive = 0
        
        for i in range(0, len(results), self.batch_size):
            batch = results[i:i + self.batch_size]
            stored, sensitive = self._retry_operation(_store_batch, batch)
            total_stored += stored
            total_sensitive += sensitive
            
        return total_stored, total_sensitive

    def close(self):
        """Safely close the connection pool"""
        if self.pool:
            self.pool.closeall()
            self.pool = None

    def start_scan_session(self, domain: str) -> int:
        """Start a new scan session and return its ID"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO scan_sessions (domain, scan_status)
                    VALUES (%s, 'running')
                    RETURNING id
                """, (domain,))
                session_id = cur.fetchone()[0]
                conn.commit()
                return session_id

    def end_scan_session(self, session_id: int, total_hosts: int, total_shares: int, total_sensitive: int):
        """Mark a scan session as complete with statistics"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE scan_sessions 
                    SET end_time = CURRENT_TIMESTAMP,
                        total_hosts = %s,
                        total_shares = %s,
                        total_sensitive_files = %s,
                        scan_status = 'completed'
                    WHERE id = %s
                """, (total_hosts, total_shares, total_sensitive, session_id))
                conn.commit()

    def get_sensitive_patterns(self) -> List[Dict]:
        """Get all sensitive patterns"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, pattern, type, description, enabled, 
                           created_at, updated_at
                    FROM sensitive_patterns
                    ORDER BY type, pattern
                """)
                columns = [desc[0] for desc in cur.description]
                return [dict(zip(columns, row)) for row in cur.fetchall()]

    def add_sensitive_pattern(self, pattern: str, type: str, description: str) -> Dict:
        """Add a new sensitive pattern"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sensitive_patterns (pattern, type, description)
                    VALUES (%s, %s, %s)
                    RETURNING id, pattern, type, description, enabled, 
                              created_at, updated_at
                """, (pattern, type, description))
                columns = [desc[0] for desc in cur.description]
                result = cur.fetchone()
                conn.commit()
                return dict(zip(columns, result))

    def update_sensitive_pattern(self, id: int, pattern: str, type: str, 
                               description: str, enabled: bool) -> Dict:
        """Update an existing sensitive pattern"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE sensitive_patterns 
                    SET pattern = %s, type = %s, description = %s, 
                        enabled = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, pattern, type, description, enabled, 
                              created_at, updated_at
                """, (pattern, type, description, enabled, id))
                columns = [desc[0] for desc in cur.description]
                result = cur.fetchone()
                conn.commit()
                return dict(zip(columns, result))

    def delete_sensitive_pattern(self, id: int) -> bool:
        """Delete a sensitive pattern"""
        with self.get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM sensitive_patterns WHERE id = %s
                """, (id,))
                deleted = cur.rowcount > 0
                conn.commit()
                return deleted