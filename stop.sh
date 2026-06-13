#!/bin/bash
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

stop_service() {
    local pid_file="$1"
    local name="$2"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "$name stopped (PID: $pid)"
        else
            echo "$name is not running"
        fi
        rm -f "$pid_file"
    else
        echo "$name PID file not found"
    fi
}

stop_service "$ROOT_DIR/.backend.pid" "Backend"
stop_service "$ROOT_DIR/.frontend.pid" "Frontend"

pkill -f "uvicorn app.main:app" 2>/dev/null && echo "Backend process killed" || true
pkill -f "vite.*2222" 2>/dev/null && echo "Frontend process killed" || true

echo "All services stopped."
