#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="__DEFAULT_SERVER_URL__"
ENROLLMENT_TOKEN=""
ENVIRONMENT="production"
ALLOW_UPGRADE="true"
AUTO_UPDATE="true"
NAME_OVERRIDE=""
REPORT_INTERVAL="__DEFAULT_REPORT_INTERVAL__"
POLL_INTERVAL="__DEFAULT_POLL_INTERVAL__"
AUTO_UPDATE_INTERVAL="__DEFAULT_AUTO_UPDATE_INTERVAL__"
INSTALL_DIR="/opt/pulseops-agent"
BIN_NAME="pulseops-agent"
SERVICE_NAME="pulseops-agent.service"
STATE_FILE="$INSTALL_DIR/state.json"
ENV_FILE="$INSTALL_DIR/pulseops-agent.env"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

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
    --auto-update)
      AUTO_UPDATE="$2"
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
    --auto-update-interval)
      AUTO_UPDATE_INTERVAL="$2"
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

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}$"; then
  systemctl stop "$SERVICE_NAME" || true
fi

TMP_BIN="$INSTALL_DIR/$BIN_NAME.new"
curl -fsSL "$SERVER_URL/downloads/$ASSET_NAME" -o "$TMP_BIN"
chmod +x "$TMP_BIN"
mv "$TMP_BIN" "$INSTALL_DIR/$BIN_NAME"

cat > "$ENV_FILE" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=$ENROLLMENT_TOKEN
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
AUTO_UPDATE=$AUTO_UPDATE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
AUTO_UPDATE_INTERVAL_SECONDS=$AUTO_UPDATE_INTERVAL
STATE_FILE=$STATE_FILE
EOF

ENROLL_OUTPUT=""
if [[ ! -s "$STATE_FILE" ]]; then
  if [[ -z "$ENROLLMENT_TOKEN" ]]; then
    echo "Missing --enrollment-token for first enrollment" >&2
    exit 1
  fi

  ENROLL_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" enroll --config "$ENV_FILE")"
else
  echo "Existing agent state detected, skipping enroll."
fi

cat > "$ENV_FILE" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
AUTO_UPDATE=$AUTO_UPDATE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
AUTO_UPDATE_INTERVAL_SECONDS=$AUTO_UPDATE_INTERVAL
STATE_FILE=$STATE_FILE
EOF

cat > /etc/systemd/system/pulseops-agent.service <<EOF
[Unit]
Description=PulseOps outbound agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/$BIN_NAME run --config $ENV_FILE
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl status --no-pager "$SERVICE_NAME" || true
if [[ -n "$ENROLL_OUTPUT" ]]; then
  echo "$ENROLL_OUTPUT"
fi
echo "PulseOps agent installed or updated and started."
