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
    fi

    echo "Waiting for PostgreSQL to be ready..."
    POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
    POSTGRES_PORT="${POSTGRES_PORT:-5432}"
    POSTGRES_USER="${POSTGRES_USER:-taskmanager}"
    POSTGRES_DB="${POSTGRES_DB:-taskmanager}"
    TIMEOUT=30
    ELAPSED=0

    while [ $ELAPSED -lt $TIMEOUT ]; do
        if command -v pg_isready &>/dev/null; then
            if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q 2>/dev/null; then
                echo "PostgreSQL is ready!"
                break
            fi
        else
            if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
                echo "PostgreSQL port $POSTGRES_PORT is open (pg_isready not available)"
                break
            fi
        fi
        sleep 1
        ELAPSED=$((ELAPSED + 1))
        echo -n "."
    done

    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo ""
        echo "ERROR: PostgreSQL failed to start within $TIMEOUT seconds" >&2
        exit 1
    fi
    echo ""
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
