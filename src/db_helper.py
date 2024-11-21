import psycopg2
from psycopg2.extras import execute_values
from typing import List, Dict
from config import Config
from psycopg2.pool import ThreadedConnectionPool
from models import ShareResult

class DatabaseHelper:
    def __init__(self, config: Config):
        self.config = config
        self.pool = None
        
    def init_tables(self):
        """Initialize database tables if they don't exist"""
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor() as cur:
                # Create shares table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS shares (
                        id SERIAL PRIMARY KEY,
                        hostname VARCHAR(255) NOT NULL,
                        share_name VARCHAR(255) NOT NULL,
                        access_level VARCHAR(50) NOT NULL,
                        error_message TEXT,
                        total_files INTEGER DEFAULT 0,
                        total_dirs INTEGER DEFAULT 0,
                        hidden_files INTEGER DEFAULT 0,
                        scan_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(hostname, share_name, scan_time)
                    )
                """)

                # Create sensitive_files table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS sensitive_files (
                        id SERIAL PRIMARY KEY,
                        share_id INTEGER REFERENCES shares(id) ON DELETE CASCADE,
                        file_path TEXT NOT NULL,
                        file_name VARCHAR(255) NOT NULL,
                        detection_type VARCHAR(50) NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # Create indexes for better query performance
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_shares_hostname ON shares(hostname);
                    CREATE INDEX IF NOT EXISTS idx_shares_scan_time ON shares(scan_time);
                    CREATE INDEX IF NOT EXISTS idx_sensitive_files_share_id ON sensitive_files(share_id);
                    CREATE INDEX IF NOT EXISTS idx_sensitive_files_detection_type ON sensitive_files(detection_type);
                """)

                conn.commit()
                print("Database tables initialized successfully")

        except Exception as e:
            if conn:
                conn.rollback()
            print(f"Error initializing database tables: {str(e)}")
            raise
        finally:
            if conn:
                self.return_connection(conn)

    def connect(self):
        """Initialize the connection pool"""
        try:
            self.pool = ThreadedConnectionPool(
                self.config.DB_MIN_CONNECTIONS,
                self.config.DB_MAX_CONNECTIONS,
                host=self.config.DB_HOST,
                port=self.config.DB_PORT,
                dbname=self.config.DB_NAME,
                user=self.config.DB_USER,
                password=self.config.DB_PASSWORD
            )
            print("Database connection pool initialized successfully")
        except Exception as e:
            print(f"Error initializing database connection pool: {str(e)}")
            raise

    def get_connection(self):
        """Get a connection from the pool"""
        if not self.pool:
            self.connect()
        return self.pool.getconn()

    def return_connection(self, conn):
        """Return a connection to the pool"""
        if self.pool:
            self.pool.putconn(conn)

    def store_results(self, results: List[ShareResult]) -> tuple[int, int]:
        """Store scan results in the database and return counts"""
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor() as cur:
                stored_count = 0
                sensitive_count = 0

                for result in results:
                    # Insert share info
                    cur.execute("""
                        INSERT INTO shares
                        (hostname, share_name, access_level, error_message,
                         total_files, total_dirs, hidden_files, scan_time)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        result.hostname,
                        result.share_name,
                        result.access_level.value,
                        result.error_message,
                        getattr(result, 'total_files', 0),
                        getattr(result, 'total_dirs', 0),
                        getattr(result, 'hidden_files', 0),
                        result.scan_time
                    ))

                    share_id = cur.fetchone()[0]
                    stored_count += 1

                    # Store sensitive files if found
                    if result.sensitive_files:
                        for sensitive_file in result.sensitive_files:
                            cur.execute("""
                                INSERT INTO sensitive_files
                                (share_id, file_path, file_name, detection_type)
                                VALUES (%s, %s, %s, %s)
                            """, (
                                share_id,
                                sensitive_file['path'],
                                sensitive_file['filename'],
                                sensitive_file['type']
                            ))
                            sensitive_count += 1

                conn.commit()
                print(f"\nStored in database:")
                print(f"- {stored_count} shares")
                print(f"- {sensitive_count} sensitive files")
                
                return stored_count, sensitive_count

        except Exception as e:
            if conn:
                conn.rollback()
            print(f"Error storing results: {str(e)}")
            raise
        finally:
            if conn:
                self.return_connection(conn)