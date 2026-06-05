#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting PostgreSQL ==="
if command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
elif docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
else
    COMPOSE=""
fi

if [ -n "$COMPOSE" ]; then
    if ! $COMPOSE -f "$SCRIPT_DIR/docker-compose.yml" ps 2>/dev/null | grep -q "db.*running\|db.*Up"; then
        $COMPOSE -f "$SCRIPT_DIR/docker-compose.yml" up -d
        echo "Waiting for PostgreSQL to be ready..."
        sleep 3
    fi
else
    echo "WARNING: Docker Compose not found. Make sure PostgreSQL is running manually."
    echo "  Expected connection: postgresql://taskmanager:taskmanager123@localhost:5432/taskmanager"
fi

echo "=== Starting Backend ==="
"$SCRIPT_DIR/backend/start.sh" &
BACKEND_PID=$!

echo "=== Starting Frontend ==="
"$SCRIPT_DIR/frontend/start.sh" &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  Multi-Tenant Task Manager is running!"
echo "  Backend:  http://localhost:2221"
echo "  Frontend: http://localhost:2222"
echo "========================================="
echo ""

wait
