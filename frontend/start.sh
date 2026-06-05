#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install --registry=https://registry.npmmirror.com
fi

npx vite --host 0.0.0.0 --port 2222
