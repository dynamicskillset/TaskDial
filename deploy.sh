#!/usr/bin/env bash
# TaskDial deploy script
# Usage: ./deploy.sh
# Builds server + frontend, rsyncs to VPS, restarts pm2.
# Never uses --delete. Backs up the DB before deploying.

set -euo pipefail

VPS="root@80.78.23.57"
REMOTE="/opt/taskdial"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "==> Building server..."
cd server
npm run build
cd ..

echo "==> Building frontend..."
cd app
npm run build
cd ..

echo "==> Backing up DB on VPS..."
ssh "$VPS" "cp $REMOTE/server/chronotasker.db $REMOTE/server/chronotasker.db.bak_$TIMESTAMP 2>/dev/null && echo 'DB backed up' || echo 'No DB to back up (first deploy?)'"

echo "==> Deploying server dist..."
rsync -az server/dist/ "$VPS:$REMOTE/server/dist/"

echo "==> Deploying server package files..."
rsync -az server/package.json server/package-lock.json "$VPS:$REMOTE/server/"

echo "==> Installing server dependencies on VPS..."
ssh "$VPS" "cd $REMOTE/server && npm install --omit=dev"

echo "==> Deploying frontend..."
rsync -az app/dist/ "$VPS:$REMOTE/frontend/"
rsync -az app/dist/ "$VPS:/opt/ghost/sites/taskdial/"

echo "==> Restarting server..."
ssh "$VPS" "pm2 restart taskdial --update-env"

echo ""
echo "==> Deploy complete. Live at https://taskdial.dynamicskillset.com"
