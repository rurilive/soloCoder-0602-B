#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "Starting backend..."
cd "$BACKEND_DIR"
uv run uvicorn app.main:app --host 0.0.0.0 --port 2221 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID) on http://localhost:2221"

echo "Starting frontend..."
cd "$FRONTEND_DIR"
npx vite --host 0.0.0.0 --port 2222 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID) on http://localhost:2222"

echo "$BACKEND_PID" > "$ROOT_DIR/.backend.pid"
echo "$FRONTEND_PID" > "$ROOT_DIR/.frontend.pid"

echo ""
echo "==================================="
echo "  记账本应用已启动"
echo "  后端 API: http://localhost:2221"
echo "  前端页面: http://localhost:2222"
echo "  API文档:  http://localhost:2221/docs"
echo "==================================="
echo ""
echo "Use ./stop.sh to stop the services."

wait
