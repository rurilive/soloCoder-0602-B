#!/bin/bash

cd "$(dirname "$0")"

echo "========================================"
echo "  Collaborative Code Editor"
echo "========================================"
echo ""

cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "Servers stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting backend server (port 2221)..."
cd backend
bash start.sh &
BACKEND_PID=$!
cd ..

sleep 3

echo "Starting frontend server (port 2222)..."
cd frontend
bash start.sh &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "  Servers started!"
echo "  Backend:  http://localhost:2221"
echo "  Frontend: http://localhost:2222"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all servers"

wait $BACKEND_PID $FRONTEND_PID
