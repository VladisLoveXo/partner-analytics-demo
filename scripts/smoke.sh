#!/usr/bin/env bash
# End-to-end check of the kind install: a service token from Keycloak, REST through nginx,
# every dependency reachable from partners-api, events stored in ClickHouse.
set -euo pipefail

WEB_URL=${WEB_URL:-http://localhost:8081}
KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8180}

token=$(curl -fsS -X POST "$KEYCLOAK_URL/realms/partners/protocol/openid-connect/token" \
  -d grant_type=client_credentials -d client_id=event-generator -d client_secret=event-generator-secret |
  sed -E 's/.*"access_token":"([^"]+)".*/\1/')

echo "GET /api/me through nginx:"
curl -fsS "$WEB_URL/api/me" -H "authorization: Bearer $token"
echo

echo "Dependencies as partners-api sees them:"
kubectl -n partner-analytics exec deploy/partners-api -- wget -qO- http://127.0.0.1:4000/healthz/deps
echo

events=$(kubectl -n infra exec statefulset/clickhouse -- clickhouse-client --user app --password app \
  -q "SELECT count() FROM analytics.events")
echo "Events in ClickHouse: $events"
test "$events" -gt 0
