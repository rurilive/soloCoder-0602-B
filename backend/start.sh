#!/bin/bash

cd "$(dirname "$0")"

if [ -d ".venv" ]; then
    VENV_DIR=".venv"
elif [ -d "venv" ]; then
    VENV_DIR="venv"
else
    if command -v uv &> /dev/null; then
        echo "Creating virtual environment with uv..."
        uv venv
        VENV_DIR=".venv"
    else
        echo "Creating virtual environment..."
        python3 -m venv venv
        VENV_DIR="venv"
    fi
fi

source "$VENV_DIR/bin/activate"

echo "Installing dependencies..."
if command -v uv &> /dev/null; then
    uv pip install -r requirements.txt
else
    pip install -r requirements.txt
fi

echo "Starting backend server on port 2221..."
python app.py
