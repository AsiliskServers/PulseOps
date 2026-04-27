export HOME=/root

#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> PulseOps update"
cd "$PROJECT_DIR"

echo "==> Git pull"
git pull --ff-only

echo "==> npm install"
npm install

echo "==> Prisma generate"
npm run prisma:generate --workspace server

echo "==> Prisma push"
npm run prisma:push --workspace server

echo "==> Build web"
npm run build --workspace web

echo "==> Build server"
npm run build --workspace server

if command -v go >/dev/null 2>&1; then
  echo "==> Build agent"
  bash ./agent/scripts/build-release.sh
else
  echo "==> Go not found, skipping agent build"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^pulseops\.service'; then
  echo "==> Restart pulseops service"
  systemctl restart pulseops
  systemctl status pulseops --no-pager --lines=5 || true
else
  echo "==> pulseops.service not found, skipping restart"
fi

echo "==> Update complete"
