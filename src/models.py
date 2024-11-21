from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional

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
