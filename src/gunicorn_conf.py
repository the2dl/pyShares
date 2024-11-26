bind = "0.0.0.0:5000"
worker_class = 'gthread'
workers = 1
threads = 4
timeout = 120
keepalive = 65
worker_connections = 1000

# Enable async workers
sync_worker = False

# Logging
loglevel = 'debug'
accesslog = '-'
errorlog = '-'

# Prevent buffering
pythonunbuffered = True