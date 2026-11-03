#!/bin/sh
set -eu
: "${SUNRISE_WEB_PUBLIC_ORIGIN:?Cloudflare Worker HTTPS origin required}"
: "${SUNRISE_WEB_BACKEND_HOST:?backend TLS hostname required}"
: "${SUNRISE_WEB_USERS_FILE:?hashed users.json mount required}"
: "${SUNRISE_EDGE_HMAC_SECRET:?Worker/backend secret required}"
[ "${#SUNRISE_EDGE_HMAC_SECRET}" -ge 32 ] || { echo 'EDGE_HMAC_SECRET_TOO_SHORT' >&2; exit 1; }
[ -r "$SUNRISE_WEB_USERS_FILE" ] || { echo 'USERS_FILE_UNREADABLE' >&2; exit 1; }
[ -r /etc/sunrise/rhwp-bin.sha256 ] || { echo 'RHWP_DIGEST_MISSING' >&2; exit 1; }
export SUNRISE_RHWP_SHA256="$(cat /etc/sunrise/rhwp-bin.sha256)"
exec python -m uvicorn cloud.app:app --host 0.0.0.0 --port 8080 --workers 1 --no-access-log
