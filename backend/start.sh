#!/bin/sh
PORT="${PORT:-8000}"
echo "Starting uvicorn server on 0.0.0.0:${PORT}"
exec uvicorn server:app --host 0.0.0.0 --port "${PORT}"
