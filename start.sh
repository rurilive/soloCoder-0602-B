#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "========================================="
echo "  Collaborative Code Editor - Startup"
echo "========================================="
echo ""

echo "Starting backend (port 2221)..."
cd "$PROJECT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo "Creating backend virtual environment..."
    if command -v uv &> /dev/null; then
        uv venv
    else
        python3 -m venv .venv
    fi
fi
source .venv/bin/activate
if command -v uv &> /dev/null; then
    uv pip install -q -r requirements.txt
else
    pip install -q -r requirements.txt
fi

python app.py &
BACKEND_PID=$!

echo "Backend started with PID: $BACKEND_PID"
echo ""

sleep 2

echo "Starting frontend (port 2222)..."
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

if command -v lsof &> /dev/null; then
    OLD_PID=$(lsof -ti:2222 || true)
    if [ -n "$OLD_PID" ]; then
        echo "Killing old process on port 2222 (PID: $OLD_PID)..."
        kill -9 $OLD_PID 2>/dev/null || true
        sleep 1
    fi
fi

npm run dev &
FRONTEND_PID=$!

echo "Frontend started with PID: $FRONTEND_PID"
echo ""
echo "========================================="
echo "  Services started!"
echo "  Backend:  http://localhost:2221"
echo "  Frontend: http://localhost:2222"
echo "========================================="
echo ""
echo "Press Ctrl+C to stop all services"

trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
