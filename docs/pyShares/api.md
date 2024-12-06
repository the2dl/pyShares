`api.py`

- **Purpose**: This file defines the API endpoints for the share scanner application using Flask.

- **Key Classes**: None (primarily functions).

- **Key Methods**:
  - `load_scans()`: Loads scan data from a file.
  - `save_scans(scans)`: Saves scan data to a file.
  - `cleanup_old_scans()`: Cleans up scans that are older than a specified retention period.
  - `get_scan_status(scan_id)`: Retrieves the status of a specific scan.
  - `start_scan()`: Initiates a new scan based on provided configuration.

- **Notes**: Utilizes Flask for web server functionality and CORS for cross-origin requests.