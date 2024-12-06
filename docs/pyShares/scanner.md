`scanner.py`

- **Purpose**: Contains the logic for scanning network shares and retrieving information.

- **Key Classes**:
  - `ShareScanner`: Main class for scanning shares.
  - `ShareDetails`: Class representing details of a scanned share.

- **Key Methods**:
  - `scan_share_root(smb, share_name: str)`: Scans the root directory of a share.
  - `scan_share_for_sensitive(smb, share_name: str, path: str)`: Scans a share for sensitive files.

- **Notes**: Uses Impacket for SMB connections and supports concurrent scanning.