#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env.local not found at $ENV_FILE"
  exit 1
fi

ACCESS_TOKEN=$(grep '^ELIZA_APP_WHATSAPP_ACCESS_TOKEN=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
PHONE_NUMBER_ID=$(grep '^ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
API_BASE="https://graph.facebook.com/v21.0"

if [[ -z "$ACCESS_TOKEN" || -z "$PHONE_NUMBER_ID" ]]; then
  echo "Error: Missing ELIZA_APP_WHATSAPP_ACCESS_TOKEN or ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID in .env.local"
  exit 1
fi

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [args]

Commands:
  request-code [sms|voice]   Request a verification code (default: sms)
  verify-code <code>         Verify the received 6-digit code
  register <pin>             Register the phone number with a 6-digit PIN

Phone Number ID: $PHONE_NUMBER_ID
EOF
  exit 1
}

request_code() {
  local method="${1:-sms}"
  echo "Requesting verification code via ${method} for phone number ID ${PHONE_NUMBER_ID}..."
  curl -s -X POST "${API_BASE}/${PHONE_NUMBER_ID}/request_code" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"code_method\": \"${method}\", \"language\": \"en_US\"}" | python3 -m json.tool
}

verify_code() {
  local code="$1"
  echo "Verifying code for phone number ID ${PHONE_NUMBER_ID}..."
  curl -s -X POST "${API_BASE}/${PHONE_NUMBER_ID}/verify_code" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"code\": \"${code}\"}" | python3 -m json.tool
}

register() {
  local pin="$1"
  echo "Registering phone number ID ${PHONE_NUMBER_ID}..."
  curl -s -X POST "${API_BASE}/${PHONE_NUMBER_ID}/register" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"messaging_product\": \"whatsapp\", \"pin\": \"${pin}\"}" | python3 -m json.tool
}

[[ $# -lt 1 ]] && usage

case "$1" in
  request-code)
    request_code "${2:-sms}"
    ;;
  verify-code)
    [[ $# -lt 2 ]] && { echo "Error: verification code required"; usage; }
    verify_code "$2"
    ;;
  register)
    [[ $# -lt 2 ]] && { echo "Error: 6-digit PIN required"; usage; }
    register "$2"
    ;;
  *)
    echo "Unknown command: $1"
    usage
    ;;
esac
