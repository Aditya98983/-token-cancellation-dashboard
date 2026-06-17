#!/bin/bash
# Serves the dashboard locally so data.json loads properly
# Run: ./serve.sh — then open http://localhost:8090

cd "$(dirname "$0")"
echo "Dashboard running at: http://localhost:8090"
echo "Press Ctrl+C to stop"
python3 -m http.server 8090
