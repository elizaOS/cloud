# Server CRD + Pepr Operator — Plan d'implémentation

## Context

Deuxième étape de l'architecture Hybrid Cloud v2. L'infra locale (kind + KEDA + PostgreSQL + Redis) est en place. On implémente le **Server CRD** et l'**Operator Pepr** qui réconcilie les ressources K8s.

Le Server CRD est l'unité de base : chaque Server CR représente un pod hébergeant N agents ElizaOS. L'Operator watch les Server CRs et crée/maintient Deployment + Service + ScaledObject (KEDA) + clés Redis.

**Framework : Pepr** (TypeScript, queue-based Reconcile, server-side apply via Kubernetes Fluent Client).

Note : l'image agent-server n'existe pas encore (étape 3). Les pods seront en ImagePullBackOff — c'est attendu.

---

## Architecture

```
                      ┌─────────────────────┐
                      │   kubectl / API      │
                      │   PATCH Server CR    │
                      └──────────┬──────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │   etcd (kind)        │
                      │                     │
                      │   Server CR          │
                      │   "srv-free-1"       │
                      │   spec:              │
                      │     capacity: 50     │
                      │     tier: free       │
                      │     agents:          │
                      │       - alice        │
                      │       - bob          │
                      └──────────┬──────────┘
                                 │ watch (Reconcile queue)
                                 ▼
                      ┌─────────────────────┐
                      │   Operator (Pepr)    │
                      │   pepr-system ns     │
                      │                     │
                      │   Pour chaque CR :   │
                      │   1. Deployment      │
                      │   2. Service         │
                      │   3. ScaledObject    │
                      │   4. Redis keys      │
                      └──────┬───┬───┬──────┘
                             │   │   │
               ┌─────────────┘   │   └─────────────┐
               ▼                 ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  Deployment   │  │   Service    │  │  ScaledObject    │
    │  srv-free-1   │  │  srv-free-1  │  │  (KEDA 0↔1)     │
    │  replicas: 1  │  │  ClusterIP   │  │  redis trigger   │
    │  image: ...   │  │  port: 3000  │  │  cooldown: 5min  │
    └──────────────┘  └──────────────┘  └──────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │      Redis       │
                                    │ agent:alice:server│
                                    │  → "srv-free-1"  │
                                    │ server:srv-free-1 │
                                    │  :status → "run" │
                                    │  :url → "http.." │
                                    └──────────────────┘
```

---

## Flow : Que se passe-t-il quand on crée un Server CR ?

### 1. L'utilisateur (ou Eliza Cloud) crée un Server CR

```bash
kubectl apply -f test-server.yaml
```

```yaml
apiVersion: eliza.ai/v1alpha1
kind: Server
metadata:
  name: srv-free-1
  namespace: eliza-agents
spec:
  capacity: 50
  tier: free
  image: localhost:5001/agent-server:dev
  agents:
    - agentId: "agent-alice"
      characterRef: "char-alice"
    - agentId: "agent-bob"
      characterRef: "char-bob"
```

### 2. Admission — Validate

Avant que le CR soit stocké dans etcd, le webhook Pepr intercepte la requête :

```
Validate:
  ✓ spec.capacity >= 1 && <= 200
  ✓ spec.agents.length <= spec.capacity (2 <= 50)
  ✓ spec.tier in ["free", "paid"]
  → APPROVED
```

Si un check échoue → la requête est **rejetée** avant d'être stockée. L'utilisateur reçoit une erreur.

### 3. Reconcile — Queue ordonnée

Le CR est stocké dans etcd. L'Operator le détecte via son watch et l'ajoute à la **queue de réconciliation** (Pepr Reconcile). La queue traite les events un par un, dans l'ordre — pas de race conditions.

```
Queue: [srv-free-1 CREATED] → processing...
```

### 4. Le Reconciler s'exécute

```
reconciler(srv-free-1):

  4a. Créer le Deployment
      ┌─────────────────────────────────┐
      │ Deployment "srv-free-1"          │
      │   replicas: 1                    │
      │   image: localhost:5001/...      │
      │   env:                           │
      │     SERVER_NAME = srv-free-1     │
      │     REDIS_URL = redis://...      │
      │     DATABASE_URL = postgres://...│
      │     CAPACITY = 50                │
      │     TIER = free                  │
      │   ownerRef → Server CR           │
      └─────────────────────────────────┘
      → K8s crée le pod (ou ImagePullBackOff si l'image n'existe pas)

  4b. Créer le Service
      ┌─────────────────────────────────┐
      │ Service "srv-free-1"             │
      │   type: ClusterIP                │
      │   port: 3000                     │
      │   selector: eliza.ai/server=...  │
      │   ownerRef → Server CR           │
      └─────────────────────────────────┘
      → Le pod sera accessible via srv-free-1.eliza-agents.svc:3000

  4c. Créer le ScaledObject (KEDA)
      ┌─────────────────────────────────┐
      │ ScaledObject "srv-free-1"        │
      │   scaleTarget: srv-free-1        │
      │   min: 0, max: 1                 │
      │   cooldown: 300s (5 min)         │
      │   trigger: redis list            │
      │     "server:srv-free-1:activity" │
      │   ownerRef → Server CR           │
      └─────────────────────────────────┘
      → KEDA surveille la liste Redis. Si vide pendant 5 min → scale à 0.
      → Si un item apparaît dans la liste → scale à 1.

  4d. Mettre à jour Redis
      SET server:srv-free-1:status   → "pending"
      SET server:srv-free-1:url      → "http://srv-free-1.eliza-agents.svc:3000"
      SET agent:agent-alice:server   → "srv-free-1"
      SET agent:agent-bob:server     → "srv-free-1"

  4e. Mettre à jour le status du CR
      status:
        phase: Pending
        readyAgents: 0
        totalAgents: 2
        observedGeneration: 1
```

### 5. Ce qui se passe après

Le pod démarre (quand l'image existera). La Gateway peut déjà résoudre les routes via Redis :

```
Gateway reçoit message pour alice
  → redis GET agent:agent-alice:server → "srv-free-1"
  → redis GET server:srv-free-1:url → "http://srv-free-1.eliza-agents.svc:3000"
  → POST http://srv-free-1.eliza-agents.svc:3000/agents/alice/message
```

---

## Flow : Suppression d'un Server CR

```bash
kubectl delete server srv-free-1 -n eliza-agents
```

1. **Finalize** (Pepr) — avant la suppression effective :
   - Nettoyage Redis : DEL toutes les clés `server:srv-free-1:*` et `agent:*:server` pour chaque agent
   - Le finalizer est retiré automatiquement par Pepr

2. **Garbage collection** (K8s natif) — grâce aux ownerReferences :
   - Deployment supprimé → pod tué
   - Service supprimé
   - ScaledObject supprimé
   - On n'a rien à faire, K8s gère

---

## Flow : Modification du Server CR (ajout d'un agent)

```bash
kubectl patch server srv-free-1 -n eliza-agents --type merge -p '{
  "spec": {"agents": [
    {"agentId": "agent-alice", "characterRef": "char-alice"},
    {"agentId": "agent-bob", "characterRef": "char-bob"},
    {"agentId": "agent-charlie", "characterRef": "char-charlie"}
  ]}
}'
```

1. **Validate** : 3 agents <= 50 capacity → OK
2. **Reconcile** : détecte l'ajout de charlie
   - Redis : `SET agent:agent-charlie:server → "srv-free-1"`
   - Status : totalAgents = 3
   - (Futur) Si pod running : `POST /agents` sur le pod pour démarrer charlie

---

## Self-healing

Si quelqu'un supprime le Deployment manuellement :

```bash
kubectl delete deploy srv-free-1 -n eliza-agents
```

L'Operator a un Watch sur les Deployments avec le label `eliza.ai/managed-by: server-operator`. Il détecte la suppression et re-déclenche le reconciler → le Deployment est recréé.

---

## Structure des fichiers

```
services/operator/
├── pepr.ts                                    # Entry point Pepr
├── package.json                               # pepr, ioredis
├── tsconfig.json                              # ES2022, bundler
├── .gitignore                                 # node_modules, dist
│
├── capabilities/
│   ├── index.ts                               # ServerController capability
│   ├── reconciler.ts                          # Logique de réconciliation
│   ├── redis.ts                               # Client ioredis + helpers
│   │
│   ├── crd/
│   │   ├── generated/
│   │   │   └── server-v1alpha1.ts             # Server class + RegisterKind
│   │   ├── source/
│   │   │   └── server.crd.ts                  # CRD complet (OpenAPI v3)
│   │   ├── register.ts                        # Applique le CRD au startup
│   │   └── validator.ts                       # Validation admission
│   │
│   └── controller/
│       └── generators.ts                      # Deployment, Service, ScaledObject

infra/local/manifests/
├── server-crd.yaml                            # CRD YAML statique
├── operator-rbac.yaml                         # RBAC
└── test-server.yaml                           # CR de test
```

---

## RBAC

L'Operator a besoin de permissions pour :

| Ressource | Verbs | Pourquoi |
|-----------|-------|----------|
| `servers.eliza.ai` | get, list, watch, update, patch | Lire les CRs, mettre à jour le status |
| `deployments.apps` | get, list, watch, create, update, patch, delete | Créer/maintenir les Deployments |
| `services` | get, list, watch, create, update, patch, delete | Créer/maintenir les Services |
| `scaledobjects.keda.sh` | get, list, watch, create, update, patch, delete | Créer/maintenir les ScaledObjects |
| `customresourcedefinitions` | get, list, create, update, patch | Enregistrer le CRD au startup |
| `pods` | get, list, watch | Lire le status des pods |
| `events` | create, patch | Émettre des events K8s |

---

## Build & Deploy

```bash
# 1. Init
cd services/operator
npx pepr init --name eliza-operator --description "ElizaOS Server Operator" --skip-post-init --yes
npm install ioredis

# 2. Build
npx pepr build

# 3. Push au registry local
docker tag pepr-<uuid>:latest localhost:5001/eliza-operator:dev
docker push localhost:5001/eliza-operator:dev

# 4. Deploy
kubectl apply -f ../../infra/local/manifests/operator-rbac.yaml
npx pepr deploy --image localhost:5001/eliza-operator:dev --force --yes
```

---

## Vérification

```bash
# CRD
kubectl get crd servers.eliza.ai

# Test CR
kubectl apply -f infra/local/manifests/test-server.yaml

# Resources créées
kubectl get servers -n eliza-agents
# NAME         PHASE     TIER   AGENTS   CAPACITY   AGE
# srv-test-1   Pending   free   0        10         5s

kubectl get deploy,svc,scaledobject -n eliza-agents -l eliza.ai/server=srv-test-1

# Redis
kubectl run redis-check --rm -i --restart=Never -n eliza-infra \
  --image=redis:7-alpine -- redis-cli -h redis GET "agent:test-agent-1:server"
# → "srv-test-1"

# Cleanup
kubectl delete server srv-test-1 -n eliza-agents
# → tout supprimé (K8s GC + Finalize Redis)
```

---

## Références

- [Pepr Operator Tutorial](https://docs.pepr.dev/tutorials/create-pepr-operator/)
- [Pepr CRD Generation](https://docs.pepr.dev/user-guide/generating-crds/)
- [Pepr Custom Resources](https://docs.pepr.dev/user-guide/custom-resources/)
- [Pepr Reconcile Action](https://docs.pepr.dev/actions/reconcile/)
- [Pepr Finalize Action](https://docs.pepr.dev/actions/finalize/)
- Spec archi : `elizaos/eliza-infra-vision/specs/spec-archi/`
