#!/bin/bash
# Deploy script for Cube Stats - syncs code but preserves data

# Configuration
REMOTE_USER="aiden"
REMOTE_HOST="100.111.229.55"
REMOTE_PATH="~/cube/cube-stats"
LOCAL_PATH="/home/aiden/Projects/cube-stats"

echo "🚀 Deploying Cube Stats to $REMOTE_USER@$REMOTE_HOST..."

# Sync files, excluding data directory and node_modules
rsync -avz --progress \
    --exclude 'data/' \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    --exclude 'package-lock.json' \
    "$LOCAL_PATH/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

echo "📦 Rebuilding Docker container..."

# SSH and rebuild
ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_PATH && docker compose down && docker compose up -d --build"

echo "✅ Deployment complete!"
echo "🌐 App should be available at cube.frizzt.com (port 8888)"
