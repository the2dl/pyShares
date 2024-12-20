from dataclasses import dataclass
from typing import Optional
import os
from dotenv import load_dotenv

@dataclass
class Config:
    LDAP_SERVER: Optional[str] = None
    LDAP_DOMAIN: Optional[str] = None
    LDAP_PORT: int = 389
    DEFAULT_THREADS: int = 10
    BATCH_SIZE: int = 1000
    DEFAULT_EXCLUDED_SHARES: list = None
    SCAN_FOR_SENSITIVE: bool = True
    
    # Database fields with connection pooling
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "fileshare_db"
    DB_USER: str = "fileshare_scanner"
    DB_PASSWORD: str = ""
    DB_MIN_CONNECTIONS: int = 10
    DB_MAX_CONNECTIONS: int = 100
    
    # Runtime credentials
    _credentials: dict = None
    
    # Scanning depth and timeout settings
    MAX_SCAN_DEPTH: int = 5
    SCAN_TIMEOUT: int = 30
    HOST_SCAN_TIMEOUT: int = 300
    
    MAX_COMPUTERS: int = 800000  # Maximum number of computers to process
    
    def __post_init__(self):
        # Load environment variables
        load_dotenv()
        
        # Set default excluded shares if not provided
        if self.DEFAULT_EXCLUDED_SHARES is None:
            self.DEFAULT_EXCLUDED_SHARES = ['ADMIN$', 'IPC$', 'print$']
            
        # Initialize empty credentials
        self._credentials = {}
            
        # Load database settings from environment (these should still use env vars)
        self.DB_HOST = os.getenv("DB_HOST", self.DB_HOST)
        self.DB_PORT = int(os.getenv("DB_PORT", self.DB_PORT))
        self.DB_NAME = os.getenv("DB_NAME", self.DB_NAME)
        self.DB_USER = os.getenv("DB_USER", self.DB_USER)
        self.DB_PASSWORD = os.getenv("DB_PASSWORD", self.DB_PASSWORD)
        
        # Only set scanning settings from environment if not explicitly provided
        # This ensures runtime values take precedence
        if self.MAX_SCAN_DEPTH == 5:  # Default value
            self.MAX_SCAN_DEPTH = int(os.getenv("MAX_SCAN_DEPTH", self.MAX_SCAN_DEPTH))
        if self.SCAN_TIMEOUT == 30:  # Default value
            self.SCAN_TIMEOUT = int(os.getenv("SCAN_TIMEOUT", self.SCAN_TIMEOUT))
        if self.HOST_SCAN_TIMEOUT == 300:  # Default value
            self.HOST_SCAN_TIMEOUT = int(os.getenv("HOST_SCAN_TIMEOUT", self.HOST_SCAN_TIMEOUT))
        if self.MAX_COMPUTERS == 800000:  # Default value
            self.MAX_COMPUTERS = int(os.getenv("MAX_COMPUTERS", self.MAX_COMPUTERS))
        if self.DEFAULT_THREADS == 10:  # Default value
            self.DEFAULT_THREADS = int(os.getenv("DEFAULT_THREADS", self.DEFAULT_THREADS))
    
    @property
    def LDAP_USER(self):
        return self._credentials.get('username')
    
    @property
    def LDAP_PASSWORD(self):
        return self._credentials.get('password')
    
    def set_credentials(self, username: str, password: str):
        """Set the runtime credentials"""
        self._credentials = {
            'username': username,
            'password': password
        }