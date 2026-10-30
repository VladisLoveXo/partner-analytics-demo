#!/bin/sh
# Runtime configuration of the SPA: the same image serves docker compose, kind or any other environment.
set -eu

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  oidcAuthority: "${OIDC_AUTHORITY:-http://localhost:8080/realms/partners}",
  oidcClientId: "${OIDC_CLIENT_ID:-partners-web}"
};
EOF
