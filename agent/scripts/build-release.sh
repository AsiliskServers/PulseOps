#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

mkdir -p "$DIST_DIR"

GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$DIST_DIR/pulseops-agent-linux-amd64" "$ROOT_DIR/cmd/pulseops-agent"
GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o "$DIST_DIR/pulseops-agent-linux-arm64" "$ROOT_DIR/cmd/pulseops-agent"

echo "Agent binaries built in $DIST_DIR"
