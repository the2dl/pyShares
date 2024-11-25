from flask import Flask, request, jsonify
from scanner import ShareScanner
from ldap_helper import LDAPHelper
from db_helper import DatabaseHelper
from config import Config
from typing import Optional
import threading
from datetime import datetime, timedelta
from flask_cors import CORS
import time
import json
import os

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Use a file-based storage for active scans
SCANS_FILE = "active_scans.json"
SCAN_RETENTION_HOURS = 24

def load_scans():
    """Load scans from file"""
    try:
        if os.path.exists(SCANS_FILE):
            with open(SCANS_FILE, 'r') as f:
                scans = json.load(f)
                # Convert string timestamps back to datetime objects
                for scan_id in scans:
                    if 'timestamp' in scans[scan_id]:
                        scans[scan_id]['timestamp'] = datetime.fromisoformat(scans[scan_id]['timestamp'])
                return scans
    except Exception as e:
        print(f"Error loading scans: {e}")
    return {}

def save_scans(scans):
    """Save scans to file"""
    try:
        # Convert datetime objects to ISO format strings
        scans_to_save = {}
        for scan_id, scan_data in scans.items():
            scans_to_save[scan_id] = scan_data.copy()
            if 'timestamp' in scans_to_save[scan_id]:
                scans_to_save[scan_id]['timestamp'] = scans_to_save[scan_id]['timestamp'].isoformat()
        
        with open(SCANS_FILE, 'w') as f:
            json.dump(scans_to_save, f)
    except Exception as e:
        print(f"Error saving scans: {e}")

def cleanup_old_scans():
    """Remove scan data older than SCAN_RETENTION_HOURS"""
    scans = load_scans()
    current_time = datetime.now()
    expired_scans = [
        scan_id for scan_id, scan_data in scans.items()
        if (current_time - scan_data.get('timestamp', current_time)).total_seconds() > SCAN_RETENTION_HOURS * 3600
    ]
    if expired_scans:
        for scan_id in expired_scans:
            scans.pop(scan_id, None)
        save_scans(scans)

def update_scan_status(scan_id, status_data):
    scans = load_scans()
    if scan_id in scans:
        scans[scan_id].update(status_data)
        if 'timestamp' not in scans[scan_id]:
            scans[scan_id]['timestamp'] = datetime.now()
        save_scans(scans)

@app.route('/api/scan/<scan_id>', methods=['GET'])
def get_scan_status(scan_id):
    cleanup_old_scans()
    scans = load_scans()
    
    if scan_id not in scans:
        return jsonify({
            "status": "not_found",
            "error": "Scan not found or expired"
        }), 404
    
    # Update timestamp
    scans[scan_id]['timestamp'] = datetime.now()
    save_scans(scans)
    
    # Remove timestamp from response
    response_data = scans[scan_id].copy()
    response_data.pop('timestamp', None)
    return jsonify(response_data)

@app.route('/api/scan', methods=['POST'])
def start_scan():
    try:
        data = request.json
        scan_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Initialize scan status
        scans = load_scans()
        scans[scan_id] = {
            "status": "running",
            "timestamp": datetime.now(),
            "progress": {
                "total_hosts": 0,
                "processed_hosts": 0,
                "current_host": None
            }
        }
        save_scans(scans)
        
        def run_scan_with_status():
            try:
                cleanup_old_scans()
                
                config = Config(
                    LDAP_SERVER=data['dc'],
                    LDAP_DOMAIN=data['domain'],
                    LDAP_PORT=data.get('ldap_port', 389),
                    DEFAULT_THREADS=data.get('threads', 10),
                    BATCH_SIZE=data.get('batch_size', 1000),
                    MAX_SCAN_DEPTH=data.get('max_depth', 5),
                    SCAN_TIMEOUT=data.get('scan_timeout', 30),
                    HOST_SCAN_TIMEOUT=data.get('host_timeout', 300),
                    MAX_COMPUTERS=data.get('max_computers', 800000)
                )
                config.set_credentials(data['username'], data['password'])

                ldap_helper = LDAPHelper(config)
                db_helper = DatabaseHelper(config)
                db_helper.connect()
                db_helper.init_tables()

                ldap_helper.connect_with_stored_credentials()
                computers = ldap_helper.get_computers(
                    ldap_filter=data.get('filter', 'all'),
                    ou=data.get('ou')
                )

                if not computers:
                    raise ValueError("No computers found")

                session_id = db_helper.start_scan_session(data['domain'])
                scanner = ShareScanner(config, db_helper, session_id)

                def progress_callback(current_host, processed, total):
                    update_scan_status(scan_id, {
                        "progress": {
                            "total_hosts": total,
                            "processed_hosts": processed,
                            "current_host": current_host
                        }
                    })

                scanner.set_progress_callback(progress_callback)
                scanner.scan_network(computers)

                update_scan_status(scan_id, {
                    "status": "completed",
                    "progress": {
                        "total_hosts": len(computers),
                        "processed_hosts": len(computers),
                        "current_host": None
                    }
                })

                db_helper.end_scan_session(
                    session_id,
                    total_hosts=len(computers),
                    total_shares=scanner.total_shares_processed,
                    total_sensitive=scanner.total_sensitive_files
                )

            except Exception as e:
                print(f"Scan error: {str(e)}")
                update_scan_status(scan_id, {
                    "status": "failed",
                    "error": str(e)
                })
            finally:
                try:
                    db_helper.close()
                except:
                    pass

        thread = threading.Thread(target=run_scan_with_status)
        thread.start()

        return jsonify({
            "status": "started",
            "scan_id": scan_id
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)