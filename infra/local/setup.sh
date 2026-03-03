#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLOUD_V2_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLUSTER_NAME="eliza-local"
REGISTRY_NAME="kind-registry"
REGISTRY_PORT="5001"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# 1. Check Docker
info "Checking Docker..."
docker info > /dev/null 2>&1 || fail "Docker is not running"
pass "Docker is running"

# 2. Start PostgreSQL + Redis + Redis REST proxy via docker-compose
info "Starting PostgreSQL + Redis + Redis REST proxy (docker compose)..."
docker compose -f "$CLOUD_V2_DIR/docker-compose.yml" up -d
sleep 2

docker compose -f "$CLOUD_V2_DIR/docker-compose.yml" ps --format '{{.Name}} {{.Status}}' | while read -r line; do
  info "  $line"
done
pass "PostgreSQL + Redis + Redis REST proxy running"

# 3. Create local registry (if not exists)
info "Creating local registry..."
if docker inspect "$REGISTRY_NAME" > /dev/null 2>&1; then
  info "  Registry already exists"
else
  docker run -d --restart=always -p "${REGISTRY_PORT}:5000" --network bridge --name "$REGISTRY_NAME" registry:2
fi
pass "Local registry on localhost:${REGISTRY_PORT}"

# 4. Create kind cluster (if not exists)
info "Creating kind cluster '$CLUSTER_NAME'..."
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  info "  Cluster already exists"
else
  kind create cluster --config "$SCRIPT_DIR/kind-config.yaml" --name "$CLUSTER_NAME"
fi

# 5. Export kubeconfig
info "Exporting kubeconfig..."
kind export kubeconfig --name "$CLUSTER_NAME"
pass "kubeconfig exported for kind-${CLUSTER_NAME}"

# 6. Connect registry to kind network
docker network connect kind "$REGISTRY_NAME" 2>/dev/null || true

# 7. Configure registry on cluster nodes (containerd 2.x hosts dir)
info "Configuring registry on cluster nodes..."
REGISTRY_DIR="/etc/containerd/certs.d/localhost:${REGISTRY_PORT}"
for node in $(kind get nodes --name "$CLUSTER_NAME"); do
  docker exec "$node" mkdir -p "$REGISTRY_DIR"
  cat <<TOML | docker exec -i "$node" cp /dev/stdin "$REGISTRY_DIR/hosts.toml"
[host."http://${REGISTRY_NAME}:5000"]
TOML
done
pass "Registry configured on all nodes"

# 8. Set kubectl context
kubectl cluster-info --context "kind-${CLUSTER_NAME}" > /dev/null 2>&1 || fail "Cannot connect to cluster"
pass "kubectl connected to kind-${CLUSTER_NAME}"

# 9. Create namespaces
info "Creating namespaces..."
kubectl apply -f "$SCRIPT_DIR/manifests/namespaces.yaml"
pass "Namespaces created"

# 10. Create ExternalName services (postgres, redis → host.docker.internal)
info "Creating ExternalName services..."
kubectl apply -f "$SCRIPT_DIR/manifests/external-services.yaml"
pass "ExternalName services created"

# 11. Install KEDA
info "Installing KEDA..."
helm repo add kedacore https://kedacore.github.io/charts 2>/dev/null || true
helm repo update kedacore > /dev/null 2>&1

if helm status keda -n keda > /dev/null 2>&1; then
  info "  KEDA already installed"
else
  helm install keda kedacore/keda --namespace keda --create-namespace --wait --timeout 120s
fi
pass "KEDA installed"

# 12. Install metrics-server (required for KEDA CPU trigger)
info "Installing metrics-server..."
if kubectl get deployment metrics-server -n kube-system > /dev/null 2>&1; then
  info "  metrics-server already installed"
else
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
  kubectl rollout status deployment/metrics-server -n kube-system --timeout=60s
fi
pass "metrics-server installed"

# 13. Create K8s Secret for agent-server env
info "Creating eliza-agent-secrets Secret..."
ENV_FILE="$SCRIPT_DIR/.env.agents"
if [ ! -f "$ENV_FILE" ]; then
  info "  No .env.agents found, creating with defaults..."
  cat > "$ENV_FILE" <<'DEFAULTS'
DATABASE_URL=postgresql://eliza_dev:local_dev_password@postgres.eliza-infra.svc:5432/eliza_dev
REDIS_URL=redis://redis.eliza-infra.svc:6379
ENABLE_DATA_ISOLATION=true
ELIZA_SERVER_ID=agent-server-local
# Uncomment and set to enable LLM via ElizaCloud proxy:
# ELIZAOS_CLOUD_API_KEY=ek_xxx
# ELIZAOS_CLOUD_BASE_URL=https://www.elizacloud.ai/api/v1
DEFAULTS
  info "  Edit $ENV_FILE to add your API keys, then re-run setup."
fi
kubectl create secret generic eliza-agent-secrets \
  --namespace eliza-agents \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -
pass "Secret eliza-agent-secrets created from .env.agents"

# 14. Build & deploy operator
info "Building operator..."
cd "$CLOUD_V2_DIR/services/operator"
npm install --silent 2>/dev/null
npx pepr build 2>&1 | tail -1

# Inject CRD into the generated Helm chart (Helm applies crds/ before templates)
mkdir -p dist/eliza-operator-chart/crds
cp crds/server-crd.yaml dist/eliza-operator-chart/crds/
cd "$SCRIPT_DIR"

info "Deploying operator via Helm..."
# Pre-create and annotate namespace so Helm can adopt it (chart template includes namespace.yaml)
kubectl create namespace pepr-system 2>/dev/null || true
kubectl label namespace pepr-system app.kubernetes.io/managed-by=Helm --overwrite > /dev/null 2>&1
kubectl annotate namespace pepr-system meta.helm.sh/release-name=eliza-operator --overwrite > /dev/null 2>&1
kubectl annotate namespace pepr-system meta.helm.sh/release-namespace=pepr-system --overwrite > /dev/null 2>&1
helm upgrade --install eliza-operator \
  "$CLOUD_V2_DIR/services/operator/dist/eliza-operator-chart/" \
  --namespace pepr-system --wait --timeout 120s

kubectl rollout status deployment/pepr-eliza-operator-watcher -n pepr-system --timeout=60s > /dev/null 2>&1
pass "Operator deployed"

# 15. Build & push agent-server image
info "Building agent-server image..."
cd "$CLOUD_V2_DIR/services/agent-server"
bun install --silent 2>/dev/null || npm install --silent 2>/dev/null
cd "$SCRIPT_DIR"

docker build -t "localhost:${REGISTRY_PORT}/agent-server:dev" \
  "$CLOUD_V2_DIR/services/agent-server"
docker push "localhost:${REGISTRY_PORT}/agent-server:dev"
pass "Agent-server image pushed to localhost:${REGISTRY_PORT}"

# 16. Build & push gateway-discord image
info "Building gateway-discord image..."
cd "$CLOUD_V2_DIR/services/gateway-discord"
bun install --silent 2>/dev/null || npm install --silent 2>/dev/null
cd "$SCRIPT_DIR"

docker build -t "localhost:${REGISTRY_PORT}/gateway-discord:dev" \
  "$CLOUD_V2_DIR/services/gateway-discord"
docker push "localhost:${REGISTRY_PORT}/gateway-discord:dev"
pass "Gateway-discord image pushed to localhost:${REGISTRY_PORT}"

# 17. Create gateway-discord Secret
info "Creating gateway-discord-secrets Secret..."
GW_ENV_FILE="$SCRIPT_DIR/.env.gateway"
if [ ! -f "$GW_ENV_FILE" ]; then
  info "  No .env.gateway found, creating with defaults..."
  cat > "$GW_ENV_FILE" <<'DEFAULTS'
ELIZA_CLOUD_URL=http://eliza-cloud.eliza-infra.svc:3000
KV_REST_API_URL=http://redis-rest.eliza-infra.svc:8079
KV_REST_API_TOKEN=local_dev_token
GATEWAY_BOOTSTRAP_SECRET=local-dev-gateway-secret-change-me
VOICE_MESSAGE_ENABLED=false
LOG_LEVEL=debug
# Eliza App bot (optional — set to test the system-wide bot)
# ELIZA_APP_DISCORD_BOT_TOKEN=your-bot-token
# ELIZA_APP_DISCORD_APPLICATION_ID=your-application-id
KEDA_COOLDOWN_SECONDS=60
DEFAULTS
  info "  Edit $GW_ENV_FILE with your secrets, then re-run setup."
fi
kubectl create secret generic gateway-discord-secrets \
  --namespace eliza-infra \
  --from-env-file="$GW_ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -
pass "Secret gateway-discord-secrets created from .env.gateway"

# 18. Deploy gateway-discord via Helm chart
info "Deploying gateway-discord via Helm..."
helm upgrade --install gateway-discord \
  "$CLOUD_V2_DIR/infra/charts/gateway-discord" \
  --namespace eliza-infra \
  --values "$SCRIPT_DIR/values-gateway.yaml" \
  --wait --timeout 120s
pass "Gateway-discord deployed via Helm"

# 19. Apply Server CRs
info "Applying Server CRs..."
for cr in "$SCRIPT_DIR"/manifests/shared-*.yaml; do
  [ -f "$cr" ] && kubectl apply -f "$cr" && info "  Applied $(basename "$cr")"
done
pass "Server CRs applied"

# === Verification ===
echo ""
info "=== Verification ==="

# Check namespaces
kubectl get ns eliza-agents > /dev/null 2>&1 && pass "Namespace eliza-agents" || fail "Namespace eliza-agents missing"
kubectl get ns eliza-infra > /dev/null 2>&1 && pass "Namespace eliza-infra" || fail "Namespace eliza-infra missing"

# Check KEDA pods
KEDA_READY=$(kubectl get pods -n keda --no-headers 2>/dev/null | grep -c "Running" || true)
[ "$KEDA_READY" -ge 1 ] && pass "KEDA pods running ($KEDA_READY)" || fail "KEDA pods not ready"

# Check KEDA CRDs
kubectl get crd scaledobjects.keda.sh > /dev/null 2>&1 && pass "KEDA CRD: ScaledObject" || fail "KEDA CRD missing"

# Check ExternalName services
kubectl get svc postgres -n eliza-infra > /dev/null 2>&1 && pass "Service: postgres.eliza-infra" || fail "Service postgres missing"
kubectl get svc redis -n eliza-infra > /dev/null 2>&1 && pass "Service: redis.eliza-infra" || fail "Service redis missing"
kubectl get svc redis-rest -n eliza-infra > /dev/null 2>&1 && pass "Service: redis-rest.eliza-infra" || fail "Service redis-rest missing"
kubectl get svc eliza-cloud -n eliza-infra > /dev/null 2>&1 && pass "Service: eliza-cloud.eliza-infra" || fail "Service eliza-cloud missing"

# Check operator
kubectl get crd servers.eliza.ai > /dev/null 2>&1 && pass "CRD: servers.eliza.ai" || fail "Server CRD missing"
OPERATOR_READY=$(kubectl get pods -n pepr-system --no-headers 2>/dev/null | grep -c "Running" || true)
[ "$OPERATOR_READY" -ge 2 ] && pass "Operator pods running ($OPERATOR_READY)" || fail "Operator pods not ready"

# Check PostgreSQL connectivity from inside the cluster
info "Testing PostgreSQL connectivity from cluster..."
kubectl run pg-test --rm -i --restart=Never -n eliza-infra \
  --image=postgres:17-alpine --quiet -- \
  psql "postgresql://eliza_dev:local_dev_password@postgres:5432/eliza_dev" \
  -t -c "SELECT 'pg-ok'" 2>/dev/null | grep -q "pg-ok" \
  && pass "PostgreSQL reachable from cluster" \
  || fail "PostgreSQL NOT reachable from cluster"

# Check Redis connectivity from inside the cluster
info "Testing Redis connectivity from cluster..."
kubectl run redis-test --rm -i --restart=Never -n eliza-infra \
  --image=redis:7-alpine --quiet -- \
  redis-cli -h redis PING 2>/dev/null | grep -q "PONG" \
  && pass "Redis reachable from cluster" \
  || fail "Redis NOT reachable from cluster"

echo ""
echo -e "${GREEN}=== All checks passed ===${NC}"
echo ""
echo "Cluster:      kind-${CLUSTER_NAME}"
echo "Registry:     localhost:${REGISTRY_PORT}"
echo "PostgreSQL:   postgres.eliza-infra.svc:5432 (eliza_dev/local_dev_password)"
echo "Redis:        redis.eliza-infra.svc:6379"
echo "Redis REST:   redis-rest.eliza-infra.svc:8079 (token: local_dev_token)"
echo "Eliza Cloud:  eliza-cloud.eliza-infra.svc:3000 (run Next.js on host)"
echo "KEDA:         installed in namespace 'keda'"
echo ""
echo "Operator:     deployed in namespace 'pepr-system'"
echo "Agent img:    localhost:${REGISTRY_PORT}/agent-server:dev"
echo "Gateway img:  localhost:${REGISTRY_PORT}/gateway-discord:dev"
echo ""
echo "Next steps:"
echo "  1. Start Eliza Cloud locally:  cd eliza-cloud-v2 && bun dev"
echo "  2. Check gateway logs:         kubectl logs -f -n eliza-infra -l app=gateway-discord"
echo "  3. Send a DM to the Eliza App bot on Discord"
