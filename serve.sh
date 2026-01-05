#!/bin/bash
# Simple script to serve the Cube Stats app
# Run from the cube-stats directory

PORT=${1:-8080}

echo "🎲 Starting Cube Stats server on port $PORT"
echo "📡 Access at: http://localhost:$PORT"
echo "🌐 Will be available at cube.frizzt.com via Cloudflare Tunnel"
echo ""
echo "Press Ctrl+C to stop the server"

python3 -m http.server $PORT
