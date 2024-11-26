from flask import Flask, request, jsonify, Response, stream_with_context
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
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
import logging
import traceback
from queue import Queue, Empty

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://localhost:3000"],
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Use a file-based storage for active scans
SCANS_FILE = "active_scans.json"
SCAN_RETENTION_HOURS = 24

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize scheduler with SQLAlchemy job store and proper error handling
try:
    jobstores = {
        'default': SQLAlchemyJobStore(url='sqlite:///jobs.db')
    }
    scheduler = BackgroundScheduler(jobstores=jobstores)
    scheduler.start()
    logger.info("Scheduler started successfully")
except Exception as e:
    logger.error(f"Failed to initialize scheduler: {str(e)}")
    logger.error(traceback.format_exc())

# Add this near your other global variables
SUBSCRIBERS = set()

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

@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    try:
        jobs = scheduler.get_jobs()
        return jsonify([{
            'id': job.id,
            'name': job.name,
            'trigger': str(job.trigger),
            'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
            'args': job.args,
            'kwargs': job.kwargs
        } for job in jobs])
    except Exception as e:
        logger.error(f"Failed to get schedules: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/schedule/<job_id>', methods=['DELETE'])
def delete_schedule(job_id):
    try:
        scheduler.remove_job(job_id)
        logger.info(f"Successfully deleted job: {job_id}")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Failed to delete job {job_id}: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/api/schedule', methods=['POST'])
def create_schedule():
    try:
        data = request.json
        
        # Extract schedule configuration
        trigger_type = data.get('trigger_type')
        schedule_config = data.get('schedule_config')
        name = data.get('name', 'Scheduled Scan')
        
        if trigger_type != 'cron':
            raise ValueError("Only cron trigger type is supported")
            
        # Convert schedule config to APScheduler cron format
        day_of_week = schedule_config.get('day_of_week', '*')
        hour = schedule_config.get('hour', 0)
        minute = schedule_config.get('minute', 0)
        
        # Create the job
        job = scheduler.add_job(
            run_scan_with_status,
            'cron',
            day_of_week=day_of_week,
            hour=hour,
            minute=minute,
            id=f"scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            name=name,
            kwargs={'scan_config': {
                'dc': data.get('dc'),
                'domain': data.get('domain'),
                'username': data.get('username'),
                'password': data.get('password'),
                'ldap_port': data.get('ldap_port', 389),
                'threads': data.get('threads', 10),
                'batch_size': data.get('batch_size', 1000),
                'max_depth': data.get('max_depth', 5),
                'scan_timeout': data.get('scan_timeout', 30),
                'host_timeout': data.get('host_timeout', 300),
                'max_computers': data.get('max_computers', 800000),
            }}
        )
        
        logger.info(f"Successfully created scheduled job: {job.id}")
        
        return jsonify({
            'status': 'success',
            'job_id': job.id,
            'next_run': job.next_run_time.isoformat() if job.next_run_time else None
        })
        
    except Exception as e:
        logger.error(f"Failed to create schedule: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# Add the run_scan_with_status function that will be called by the scheduler
def run_scan_with_status(scan_config: dict):
    """Function that will be called by the scheduler to run the scan"""
    try:
        logger.info(f"Starting scheduled scan with config: {scan_config}")
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
        
        # Initialize configuration
        config = Config(
            LDAP_SERVER=scan_config['dc'],
            LDAP_DOMAIN=scan_config['domain'],
            LDAP_PORT=scan_config.get('ldap_port', 389),
            DEFAULT_THREADS=scan_config.get('threads', 10),
            BATCH_SIZE=scan_config.get('batch_size', 1000),
            MAX_SCAN_DEPTH=scan_config.get('max_depth', 5),
            SCAN_TIMEOUT=scan_config.get('scan_timeout', 30),
            HOST_SCAN_TIMEOUT=scan_config.get('host_timeout', 300),
            MAX_COMPUTERS=scan_config.get('max_computers', 800000)
        )
        config.set_credentials(scan_config['username'], scan_config['password'])

        # Initialize helpers
        ldap_helper = LDAPHelper(config)
        db_helper = DatabaseHelper(config)
        db_helper.connect()
        db_helper.init_tables()

        # Connect to LDAP
        ldap_helper.connect_with_stored_credentials()
        computers = ldap_helper.get_computers(
            ldap_filter=scan_config.get('filter', 'all'),
            ou=scan_config.get('ou')
        )

        if not computers:
            raise ValueError("No computers found")

        # Start scan session
        session_id = db_helper.start_scan_session(scan_config['domain'])
        scanner = ShareScanner(config, db_helper, session_id)

        def progress_callback(current_host, processed, total):
            update_scan_status(scan_id, {
                "progress": {
                    "total_hosts": total,
                    "processed_hosts": processed,
                    "current_host": current_host
                }
            })

        # Set progress callback and run scan
        scanner.set_progress_callback(progress_callback)
        scanner.scan_network(computers)

        # Update final status
        update_scan_status(scan_id, {
            "status": "completed",
            "progress": {
                "total_hosts": len(computers),
                "processed_hosts": len(computers),
                "current_host": None
            }
        })

        # End scan session
        db_helper.end_scan_session(
            session_id,
            total_hosts=len(computers),
            total_shares=scanner.total_shares_processed,
            total_sensitive=scanner.total_sensitive_files
        )

        logger.info(f"Scheduled scan completed successfully: {scan_id}")

        # After scan completes successfully
        notify_subscribers({
            'type': 'scan_complete',
            'scan_id': scan_id,
            'domain': scan_config['domain'],
            'timestamp': datetime.now().isoformat(),
            'stats': {
                'total_hosts': len(computers),
                'total_shares': scanner.total_shares_processed,
                'total_sensitive': scanner.total_sensitive_files
            }
        })

    except Exception as e:
        logger.error(f"Scheduled scan failed: {str(e)}")
        logger.error(traceback.format_exc())
        if scan_id:
            update_scan_status(scan_id, {
                "status": "failed",
                "error": str(e)
            })
        notify_subscribers({
            'type': 'scan_error',
            'scan_id': scan_id,
            'domain': scan_config['domain'],
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        })
        raise
    finally:
        try:
            db_helper.close()
        except:
            pass

def notify_subscribers(event_data):
    """Notify all subscribers of an event"""
    logger.info(f"Notifying subscribers of event: {event_data}")
    logger.info(f"Current subscribers before notification: {len(SUBSCRIBERS)}")
    
    dead_subscribers = set()
    
    for subscriber in SUBSCRIBERS.copy():  # Use copy to avoid modification during iteration
        try:
            subscriber.put(event_data)
            logger.info("Successfully sent event to subscriber")
        except Exception as e:
            logger.error(f"Failed to notify subscriber: {str(e)}")
            logger.error("Error details:", exc_info=True)
            dead_subscribers.add(subscriber)
    
    # Remove dead subscribers
    for dead in dead_subscribers:
        SUBSCRIBERS.discard(dead)
    
    logger.info(f"Subscribers after notification: {len(SUBSCRIBERS)}")

@app.route('/api/events', methods=['GET'])
def events():
    def event_stream():
        queue = Queue()
        SUBSCRIBERS.add(queue)
        logger.info(f"New subscriber connected. Total subscribers: {len(SUBSCRIBERS)}")
        
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected'})}\n\n".encode('utf-8')
            
            while True:
                try:
                    # Shorter timeout for more frequent heartbeats
                    event_data = queue.get(timeout=30)
                    logger.info(f"Sending event to client: {event_data}")
                    yield f"data: {json.dumps(event_data)}\n\n".encode('utf-8')
                except Empty:
                    # Queue timeout - send heartbeat
                    logger.debug("Sending heartbeat")
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n".encode('utf-8')
                    # Force flush the response
                    if hasattr(Response, 'flush'):
                        Response.flush()
                except Exception as e:
                    logger.error(f"Error in event stream: {str(e)}")
                    logger.error("Error details:", exc_info=True)
                    break

        finally:
            SUBSCRIBERS.discard(queue)
            logger.info(f"Subscriber disconnected. Remaining subscribers: {len(SUBSCRIBERS)}")

    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': 'http://localhost:5173',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'text/event-stream'
        }
    )

if __name__ == '__main__':
    app.run(debug=True)