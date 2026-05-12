#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$AGENT_DIR/dist"
REPO_DIR="$(cd "$AGENT_DIR/.." && pwd)"

mkdir -p "$DIST_DIR"

cd "$AGENT_DIR"

COMMIT_TS="$(git -C "$REPO_DIR" log -1 --format=%ct 2>/dev/null || date +%s)"
COMMIT_SHA="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
AGENT_VERSION="${COMMIT_TS}-${COMMIT_SHA}"
LDFLAGS="-s -w -X main.version=${AGENT_VERSION}"

GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="$LDFLAGS" -o "$DIST_DIR/pulseops-agent-linux-amd64" ./cmd/pulseops-agent
GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="$LDFLAGS" -o "$DIST_DIR/pulseops-agent-linux-arm64" ./cmd/pulseops-agent

AMD64_SHA256="$(sha256sum "$DIST_DIR/pulseops-agent-linux-amd64" | awk '{print $1}')"
ARM64_SHA256="$(sha256sum "$DIST_DIR/pulseops-agent-linux-arm64" | awk '{print $1}')"

cat > "$DIST_DIR/latest.json" <<EOF
{
  "version": "$AGENT_VERSION",
  "assets": {
    "linux-amd64": "pulseops-agent-linux-amd64",
    "linux-arm64": "pulseops-agent-linux-arm64"
  },
  "checksums": {
    "pulseops-agent-linux-amd64": "$AMD64_SHA256",
    "pulseops-agent-linux-arm64": "$ARM64_SHA256"
  }
}
EOF

echo "Agent binaries built in $DIST_DIR"
