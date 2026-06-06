#!/bin/bash

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting frontend server on port 2222..."
npm run dev
