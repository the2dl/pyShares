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
    
    def __post_init__(self):
        # Load environment variables
        load_dotenv()
        
        # Set default excluded shares if not provided
        if self.DEFAULT_EXCLUDED_SHARES is None:
            self.DEFAULT_EXCLUDED_SHARES = ['ADMIN$', 'IPC$', 'print$']
            
        # Initialize empty credentials
        self._credentials = {}
            
        # Load database settings from environment
        self.DB_HOST = os.getenv("DB_HOST", self.DB_HOST)
        self.DB_PORT = int(os.getenv("DB_PORT", self.DB_PORT))
        self.DB_NAME = os.getenv("DB_NAME", self.DB_NAME)
        self.DB_USER = os.getenv("DB_USER", self.DB_USER)
        self.DB_PASSWORD = os.getenv("DB_PASSWORD", self.DB_PASSWORD)
    
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