#!/bin/bash
set -e

# ChronoTasker VPS-side deploy script
# Runs ON the VPS — triggered by GitHub Actions or manually
# Usage: cd /opt/chronotasker/repo && bash deploy/deploy.sh

REPO_DIR="/opt/chronotasker/repo"
SERVER_DIR="/opt/chronotasker/server"
FRONTEND_DIR="/opt/chronotasker/frontend"
CADDY_DIR="/opt/ghost/sites/chronotasker"

echo "=== ChronoTasker Deploy ==="

# 1. Pull latest code
echo "[1/7] Pulling latest code..."
cd "$REPO_DIR"
git fetch origin main
git reset --hard origin/main

# 2. Build frontend
echo "[2/7] Building frontend..."
cd "$REPO_DIR/chronotasker-app"
npm ci
npm run build

# 3. Build server
echo "[3/7] Building server..."
cd "$REPO_DIR/server"
npm ci
npm run build

# 4. Copy frontend to Caddy serving directory
echo "[4/7] Deploying frontend..."
mkdir -p "$FRONTEND_DIR" "$CADDY_DIR"
rsync -a --delete "$REPO_DIR/chronotasker-app/dist/" "$FRONTEND_DIR/"
rsync -a --delete "$FRONTEND_DIR/" "$CADDY_DIR/"

# 5. Copy server dist
echo "[5/7] Deploying server..."
mkdir -p "$SERVER_DIR/dist"
rsync -a --delete "$REPO_DIR/server/dist/" "$SERVER_DIR/dist/"

# 6. Install production dependencies
echo "[6/7] Installing server dependencies..."
cd "$SERVER_DIR"
cp "$REPO_DIR/server/package.json" "$SERVER_DIR/package.json"
cp "$REPO_DIR/server/package-lock.json" "$SERVER_DIR/package-lock.json" 2>/dev/null || true
npm ci --production

# 7. Restart pm2
echo "[7/7] Restarting server..."
pm2 restart chronotasker
pm2 save

echo ""
echo "=== Deploy complete ==="
echo "Server running on port 3001"
echo "Frontend served by Caddy"
