#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="eliza-local"
REGISTRY_NAME="kind-registry"

echo "Removing operator Helm release..."
helm uninstall eliza-operator -n pepr-system 2>/dev/null || true

echo "Deleting kind cluster '$CLUSTER_NAME'..."
kind delete cluster --name "$CLUSTER_NAME" 2>/dev/null || echo "Cluster not found"

echo "Removing local registry..."
docker rm -f "$REGISTRY_NAME" 2>/dev/null || echo "Registry not found"

echo "Done. docker-compose (PostgreSQL + Redis) left untouched."
