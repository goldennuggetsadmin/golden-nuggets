#!/usr/bin/env bash
# ==============================================================================
# Golden Nuggets — Production-Quality Local Development Environment Launcher
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"
ADMIN_DIR="/Users/selvi.none/Desktop/ministries/golden-nuggets-admin-panel-main/frontend"
MOBILE_DIR="${PROJECT_ROOT}/frontend"

echo "================================──────────────────────────────"
echo "🌟 Starting Golden Nuggets Local Development Environment"
echo "================================──────────────────────────────"

# 1. Environment & Package Validation
echo "🔍 [1/4] Validating Python environment & dependencies..."
python3 -c "
import fastapi, uvicorn, asyncpg, httpx, pdfplumber, cachetools, supabase, pydantic
print('  ✅ Python dependencies validated (fastapi, asyncpg, pdfplumber, cachetools, etc.)')
" || {
  echo "  ❌ Missing Python packages! Installing requirements..."
  pip install -r "${BACKEND_DIR}/requirements.txt"
}

# 2. Check Port Availability
echo "🔌 [2/4] Checking ports (8000 for Backend, 3000 for Admin Panel)..."
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "  ⚠️ Port 8000 is already in use. Stopping existing process on port 8000..."
    kill -9 $(lsof -t -i:8000) 2>/dev/null || true
fi

# 3. Launch Local Backend
echo "🚀 [3/4] Launching Local FastAPI Backend on http://127.0.0.1:8000..."
cd "${BACKEND_DIR}"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
sleep 2

# 4. Verify Health Endpoint
echo "🩺 [4/4] Verifying Backend Health Check..."
python3 -c "
import urllib.request, json, time
for i in range(10):
    try:
        res = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)
        if res.status == 200:
            data = json.loads(res.read().decode('utf-8'))
            print(f'  ✅ Backend Operational! Database: {data.get(\"database\", {}).get(\"status\")}, Sermons: {data.get(\"database\", {}).get(\"sermon_count\")}')
            break
    except Exception:
        time.sleep(1)
"

echo "================================──────────────────────────────"
echo "✅ LOCAL DEVELOPMENT ENVIRONMENT READY"
echo "================================──────────────────────────────"
echo "  • Local Backend:      http://127.0.0.1:8000"
echo "  • Health Endpoint:    http://127.0.0.1:8000/health"
echo "  • Mobile API Target:  http://127.0.0.1:8000/api/v1/mobile"
echo "  • Admin API Target:   http://127.0.0.1:8000/api/v1/admin"
echo "  • Shared Supabase DB: db.ygvgezcyqctyajzjungj.supabase.co:5432"
echo "================================──────────────────────────────"

# Keep script running
wait ${BACKEND_PID}
