#!/usr/bin/env bash
# Creates the kind cluster, builds the images and loads them into it,
# then installs the dev infrastructure and the application with Helm.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=partner-analytics
TAG=${TAG:-0.1.0}

if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --config deploy/kind/cluster.yaml
fi

declare -A DOCKERFILES=(
  [partners-api]=services/partners-api/Dockerfile
  [stats-service]=services/stats-service/Dockerfile
  [web]=apps/web/Dockerfile
  [event-generator]=tools/event-generator/Dockerfile
)
# Only our own images are loaded. Third-party ones (PostgreSQL, ClickHouse, Redis, Keycloak) are pulled
# by the node itself: with Docker's containerd image store a pulled multi-platform image cannot be
# exported for `kind load` (the other platforms' layers are missing locally).
for component in "${!DOCKERFILES[@]}"; do
  docker build -t "partner-analytics/$component:$TAG" -f "${DOCKERFILES[$component]}" .
  kind load docker-image "partner-analytics/$component:$TAG" --name "$CLUSTER"
done

helm upgrade --install infra deploy/charts/infra \
  --namespace infra --create-namespace \
  --set-file keycloak.realm=infra/keycloak/realm-partners.json \
  --wait --timeout 10m

helm upgrade --install partner-analytics deploy/charts/partner-analytics \
  --namespace partner-analytics --create-namespace \
  --set image.tag="$TAG" \
  --wait --timeout 10m

kubectl -n partner-analytics get pods
echo
echo "UI: http://localhost:8081  (alpha/alpha, beta/beta, admin/admin)"
