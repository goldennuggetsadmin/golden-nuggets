#!/bin/sh
echo "Starting uvicorn on 0.0.0.0:8000"
exec uvicorn server:app --host 0.0.0.0 --port 8000
