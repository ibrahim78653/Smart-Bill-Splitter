#!/bin/bash
# Smart Bill Splitter — Backend Production Start Script
set -e

echo "Starting Smart Bill Splitter Backend..."

# Activate virtualenv if present
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Ensure uploads directory exists
mkdir -p uploads

# Start Uvicorn ASGI server with 4 workers
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \
    --proxy-headers \
    --forwarded-allow-ips='*'
