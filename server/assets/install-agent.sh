#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="__DEFAULT_SERVER_URL__"
ENROLLMENT_TOKEN=""
ENVIRONMENT="production"
ALLOW_UPGRADE="true"
SHELL_ACCESS_ENABLED="true"
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
  while IFS='=' read -r key value; do
    case "$key" in
      SERVER_URL)
        SERVER_URL="$value"
        ;;
      ENROLLMENT_TOKEN)
        ENROLLMENT_TOKEN="$value"
        ;;
      ENVIRONMENT)
        ENVIRONMENT="$value"
        ;;
      ALLOW_UPGRADE)
        ALLOW_UPGRADE="$value"
        ;;
      SHELL_ACCESS_ENABLED)
        SHELL_ACCESS_ENABLED="$value"
        ;;
      AUTO_UPDATE)
        AUTO_UPDATE="$value"
        ;;
      NAME_OVERRIDE)
        NAME_OVERRIDE="$value"
        ;;
      REPORT_INTERVAL_SECONDS)
        REPORT_INTERVAL="$value"
        ;;
      JOB_POLL_INTERVAL_SECONDS)
        POLL_INTERVAL="$value"
        ;;
      AUTO_UPDATE_INTERVAL_SECONDS)
        AUTO_UPDATE_INTERVAL="$value"
        ;;
    esac
  done < "$ENV_FILE"
fi
FORCE_REENROLL="false"

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
    --shell-access)
      SHELL_ACCESS_ENABLED="$2"
      shift 2
      ;;
    --agent-profile)
      case "$2" in
        standard)
          SHELL_ACCESS_ENABLED="true"
          ;;
        appliance|infrastructure|restricted)
          SHELL_ACCESS_ENABLED="false"
          ;;
        *)
          echo "Unknown agent profile: $2" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    --auto-update)
      AUTO_UPDATE="$2"
      shift 2
      ;;
    --force-reenroll)
      FORCE_REENROLL="true"
      shift
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

validate_bool() {
  local name="$1"
  local value="$2"

  case "$value" in
    true|false)
      ;;
    *)
      echo "$name must be true or false." >&2
      exit 1
      ;;
  esac
}

validate_interval() {
  local name="$1"
  local value="$2"
  local min="$3"
  local max="$4"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value < min || value > max )); then
    echo "$name must be an integer between $min and $max." >&2
    exit 1
  fi
}

if [[ ! "$SERVER_URL" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "SERVER_URL must be an HTTP(S) URL without whitespace." >&2
  exit 1
fi

case "$ENVIRONMENT" in
  production|staging|internal|other)
    ;;
  *)
    echo "ENVIRONMENT must be production, staging, internal, or other." >&2
    exit 1
    ;;
esac

validate_bool "ALLOW_UPGRADE" "$ALLOW_UPGRADE"
validate_bool "SHELL_ACCESS_ENABLED" "$SHELL_ACCESS_ENABLED"
validate_bool "AUTO_UPDATE" "$AUTO_UPDATE"
validate_interval "REPORT_INTERVAL_SECONDS" "$REPORT_INTERVAL" 30 86400
validate_interval "JOB_POLL_INTERVAL_SECONDS" "$POLL_INTERVAL" 2 3600
validate_interval "AUTO_UPDATE_INTERVAL_SECONDS" "$AUTO_UPDATE_INTERVAL" 60 86400

if [[ -n "$ENROLLMENT_TOKEN" && "$ENROLLMENT_TOKEN" =~ [[:space:]] ]]; then
  echo "ENROLLMENT_TOKEN must not contain whitespace." >&2
  exit 1
fi

if (( ${#NAME_OVERRIDE} > 120 )) || [[ "$NAME_OVERRIDE" == *$'\n'* || "$NAME_OVERRIDE" == *$'\r'* ]]; then
  echo "NAME_OVERRIDE must be 120 characters or fewer and stay on one line." >&2
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

umask 077
mkdir -p "$INSTALL_DIR"
chmod 700 "$INSTALL_DIR"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}$"; then
  systemctl stop "$SERVICE_NAME" || true
fi

TMP_BIN="$INSTALL_DIR/$BIN_NAME.new"
TMP_MANIFEST="$INSTALL_DIR/latest.json.new"
curl -fsSL "$SERVER_URL/downloads/latest.json" -o "$TMP_MANIFEST"
EXPECTED_SHA256="$(
  awk -v name="$ASSET_NAME" '
    in_checksums && /^[[:space:]]*}/ {
      exit
    }
    in_checksums && index($0, "\"" name "\"") {
      split($0, parts, ":")
      value = parts[2]
      gsub(/[",[:space:]]/, "", value)
      print value
      exit
    }
    /"checksums"[[:space:]]*:/ {
      in_checksums = 1
    }
  ' "$TMP_MANIFEST"
)"
rm -f "$TMP_MANIFEST"
if [[ ! "$EXPECTED_SHA256" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "Missing or invalid checksum for $ASSET_NAME in latest.json" >&2
  exit 1
fi
curl -fsSL "$SERVER_URL/downloads/$ASSET_NAME" -o "$TMP_BIN"
printf '%s  %s\n' "$EXPECTED_SHA256" "$TMP_BIN" | sha256sum -c -
chmod +x "$TMP_BIN"
mv "$TMP_BIN" "$INSTALL_DIR/$BIN_NAME"

cat > "$ENV_FILE" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=$ENROLLMENT_TOKEN
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
SHELL_ACCESS_ENABLED=$SHELL_ACCESS_ENABLED
AUTO_UPDATE=$AUTO_UPDATE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
AUTO_UPDATE_INTERVAL_SECONDS=$AUTO_UPDATE_INTERVAL
STATE_FILE=$STATE_FILE
EOF
chmod 600 "$ENV_FILE"

ENROLL_OUTPUT=""
should_reenroll_from_check_failure() {
  local output="$1"

  [[ "$output" == *"unknown command"* ]] || [[ "$output" == *"<enroll|run>"* ]]
}

if [[ "$FORCE_REENROLL" == "true" && -s "$STATE_FILE" ]]; then
  echo "Force re-enroll requested, removing existing agent state."
  rm -f "$STATE_FILE"
fi

if [[ -s "$STATE_FILE" ]]; then
  CHECK_OUTPUT=""
  set +e
  CHECK_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" check-auth --config "$ENV_FILE" 2>&1)"
  CHECK_STATUS=$?
  set -e

  if [[ "$CHECK_STATUS" -eq 0 ]]; then
    echo "Existing agent state verified, skipping enroll."
  elif [[ "$CHECK_STATUS" -eq 10 || "$CHECK_STATUS" -eq 11 ]]; then
    if [[ -z "$ENROLLMENT_TOKEN" ]]; then
      echo "Existing agent state is invalid and --enrollment-token was not provided." >&2
      exit 1
    fi

    echo "Existing agent state is invalid or rejected by server, re-enrolling."
    rm -f "$STATE_FILE"
    ENROLL_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" enroll --config "$ENV_FILE")"
  elif should_reenroll_from_check_failure "$CHECK_OUTPUT"; then
    if [[ -z "$ENROLLMENT_TOKEN" ]]; then
      echo "Existing agent state needs re-enrollment, but --enrollment-token was not provided." >&2
      exit 1
    fi

    echo "Existing agent binary does not support credential verification, forcing re-enroll."
    rm -f "$STATE_FILE"
    ENROLL_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" enroll --config "$ENV_FILE")"
  else
    echo "Existing agent state detected, but credential verification failed; keeping existing enrollment." >&2
    if [[ -n "$CHECK_OUTPUT" ]]; then
      echo "$CHECK_OUTPUT" >&2
    fi
  fi
else
  if [[ -z "$ENROLLMENT_TOKEN" ]]; then
    echo "Missing --enrollment-token for first enrollment" >&2
    exit 1
  fi

  ENROLL_OUTPUT="$("$INSTALL_DIR/$BIN_NAME" enroll --config "$ENV_FILE")"
fi

cat > "$ENV_FILE" <<EOF
SERVER_URL=$SERVER_URL
ENROLLMENT_TOKEN=
ENVIRONMENT=$ENVIRONMENT
ALLOW_UPGRADE=$ALLOW_UPGRADE
SHELL_ACCESS_ENABLED=$SHELL_ACCESS_ENABLED
AUTO_UPDATE=$AUTO_UPDATE
NAME_OVERRIDE=$NAME_OVERRIDE
REPORT_INTERVAL_SECONDS=$REPORT_INTERVAL
JOB_POLL_INTERVAL_SECONDS=$POLL_INTERVAL
AUTO_UPDATE_INTERVAL_SECONDS=$AUTO_UPDATE_INTERVAL
STATE_FILE=$STATE_FILE
EOF
chmod 600 "$ENV_FILE"

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
