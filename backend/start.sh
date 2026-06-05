#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
    echo "Installing dependencies with uv..."
    uv venv .venv
    uv pip install -r pyproject.toml
fi

source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 2221 --reload
