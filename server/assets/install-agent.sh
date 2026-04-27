#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="__DEFAULT_SERVER_URL__"
ENROLLMENT_TOKEN=""
ENVIRONMENT="production"
ALLOW_UPGRADE="true"
NAME_OVERRIDE=""
REPORT_INTERVAL="__DEFAULT_REPORT_INTERVAL__"
POLL_INTERVAL="__DEFAULT_POLL_INTERVAL__"
INSTALL_DIR="/opt/pulseops-agent"
BIN_NAME="pulseops-agent"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url)
      SERVER_URL="$2"
      shift 2
      ;;
    --enrollment-token)
      ENROLLMENT_TOKEN="$2"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --allow-upgrade)
      ALLOW_UPGRADE="$2"
      shift 2
      ;;
    --name)
      NAME_OVERRIDE="$2"
      shift 2
      ;;
    --report-interval)
      REPORT_INTERVAL="$2"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This installer must run as root." >&2
  exit 1
fi

if [[ ! -f /etc/debian_version ]]; then
  echo "This installer only supports Debian systems." >&2
  exit 1
fi

if ! grep -qE '^13(\.|$)' /etc/debian_version; then
  echo "This installer targets Debian 13." >&2
  exit 1
fi

if [[ -z "$ENROLLMENT_TOKEN" ]]; then
  echo "Missing --enrollment-token" >&2
  exit 1
fi

ARCH="$(dpkg --print-architecture)"

case "$ARCH" in
  amd64)
    ASSET_NAME="pulseops-agent-linux-amd64"
    ;;
  arm64)
    ASSET_NAME="pulseops-agent-linux-arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

mkdir -p "$INSTALL_DIR"

curl -fsSL "$SERVER_URL/downloads/$ASSET_NAME" -o "$INSTALL_DIR/$BIN_NAME"
chmod +x "$INSTALL_DIR/$BIN_NAME"

cat > "$INSTALL_DIR/pulseops-agent.env" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=$ENROLLMENT_TOKEN
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
STATE_FILE=$INSTALL_DIR/state.json
EOF

ENROLL_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" enroll --config "$INSTALL_DIR/pulseops-agent.env")"

cat > "$INSTALL_DIR/pulseops-agent.env" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
STATE_FILE=$INSTALL_DIR/state.json
EOF

cat > /etc/systemd/system/pulseops-agent.service <<EOF
[Unit]
Description=PulseOps outbound agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/pulseops-agent.env
ExecStart=$INSTALL_DIR/$BIN_NAME run --config $INSTALL_DIR/pulseops-agent.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now pulseops-agent.service
systemctl status --no-pager pulseops-agent.service || true
echo "$ENROLL_OUTPUT"
echo "PulseOps agent installed and started."
