#!/bin/bash
set -e

cd "$(dirname "$0")"

if command -v uv &> /dev/null; then
    if [ ! -d ".venv" ]; then
        echo "Creating virtual environment with uv..."
        uv venv
    fi
    echo "Activating virtual environment..."
    source .venv/bin/activate
    echo "Installing dependencies with uv..."
    uv pip install -r requirements.txt
else
    if [ ! -d ".venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv .venv
    fi
    echo "Activating virtual environment..."
    source .venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

echo "Starting backend server on port 2221..."
python app.py
