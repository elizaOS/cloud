#!/usr/bin/env bash
# Reconcile docker_nodes.allocated_count from live milady_sandboxes rows.
# Safe docker usage: read-only `docker ps` over SSH; never starts/stops/removes containers.
set -Eeuo pipefail

ENV_FILE=${ENV_FILE:-/opt/eliza-cloud/.env.local}
LOG_FILE=${LOG_FILE:-/var/log/eliza-cloud/reconcile-allocations.log}
PROM_FILE=${PROM_FILE:-/var/lib/eliza-cloud/reconcile-allocations.prom}
ALERTMANAGER_URL=${ALERTMANAGER_URL:-http://127.0.0.1:9093}
LOCK_FILE=${LOCK_FILE:-/var/lock/eliza-cloud-reconcile-allocations.lock}
SSH_KEY=${SSH_KEY:-/root/.ssh/milady-nodes}
DRY_RUN=0
SEND_ALERTS=1

usage() {
  cat <<'USAGE'
Usage: reconcile-allocations.sh [--dry-run] [--no-alert]

Reconciles docker_nodes.allocated_count to COUNT(milady_sandboxes WHERE status IN
('running','starting','provisioning')), logs docker-vs-DB drift, and marks only
obvious stale status=running rows as status=error when a successful docker ps
snapshot for that node proves the container is missing.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-alert) SEND_ALERTS=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$PROM_FILE")" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(date -Is) another reconcile-allocations run is active; exiting"
  exit 0
fi

log() { echo "$(date -Is) $*"; }

if [[ ! -r "$ENV_FILE" ]]; then
  log "ERROR env file not readable: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR DATABASE_URL is not set by $ENV_FILE"
  exit 1
fi

psql_tsv() {
  local sql=$1
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -F $'\t' -Atc "$sql"
}

psql_cmd() {
  local sql=$1
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -c "$sql"
}

tmp=$(mktemp -d /tmp/reconcile-allocations.XXXXXX)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
mkdir -p "$tmp/docker" "$tmp/docker-ok"

log "START dry_run=$DRY_RUN"

psql_tsv "select node_id, hostname, coalesce(ssh_port,22), coalesce(ssh_user,'root'), allocated_count, capacity, enabled, status from public.docker_nodes order by node_id" > "$tmp/nodes.tsv"
psql_tsv "select node_id, id, coalesce(container_name,''), status from public.milady_sandboxes order by node_id nulls last, id" > "$tmp/sandboxes.tsv"

while IFS=$'\t' read -r node_id hostname ssh_port ssh_user allocated capacity enabled node_status; do
  [[ -z "$node_id" || -z "$hostname" ]] && continue
  out="$tmp/docker/${node_id}.txt"
  ssh_args=(-n -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -p "$ssh_port")
  if [[ -r "$SSH_KEY" ]]; then
    ssh_args=(-i "$SSH_KEY" "${ssh_args[@]}")
  fi
  if ssh "${ssh_args[@]}" "${ssh_user}@${hostname}" \
      "docker ps --filter name=milady- --format '{{.Names}}'" > "$out" 2>"$tmp/docker/${node_id}.err"; then
    sort -u "$out" -o "$out"
    touch "$tmp/docker-ok/${node_id}"
    log "docker_ps node=$node_id host=$hostname count=$(wc -l < "$out" | tr -d ' ')"
  else
    rm -f "$out"
    log "WARN docker_ps_failed node=$node_id host=$hostname error=$(tr '\n' ' ' < "$tmp/docker/${node_id}.err" | sed 's/[[:space:]]\+/ /g' | cut -c1-240)"
  fi
done < "$tmp/nodes.tsv"

python3 - "$tmp" "$PROM_FILE" <<'PY'
from __future__ import annotations
import sys
from collections import defaultdict
from pathlib import Path

tmp = Path(sys.argv[1])
prom_file = Path(sys.argv[2])
live = {"running", "starting", "provisioning"}

nodes = []
for line in (tmp / "nodes.tsv").read_text().splitlines():
    if not line.strip():
        continue
    node_id, hostname, ssh_port, ssh_user, allocated, capacity, enabled, status = line.split("\t")
    nodes.append({
        "node_id": node_id,
        "hostname": hostname,
        "allocated": int(allocated),
        "capacity": capacity,
        "enabled": enabled,
        "status": status,
    })

by_node = defaultdict(list)
for line in (tmp / "sandboxes.tsv").read_text().splitlines():
    if not line.strip():
        continue
    node_id, sid, container_name, status = line.split("\t")
    by_node[node_id].append((sid, container_name, status))

stale = []
alerts = []
prom_lines = [
    "# HELP milady_allocation_drift docker_nodes allocated_count minus DB live sandbox truth",
    "# TYPE milady_allocation_drift gauge",
    "# HELP milady_allocation_drift_abs absolute docker_nodes allocation drift",
    "# TYPE milady_allocation_drift_abs gauge",
    "# HELP milady_db_live_sandboxes live DB sandbox rows by node",
    "# TYPE milady_db_live_sandboxes gauge",
    "# HELP milady_docker_ps_milady_containers running docker ps milady-* containers by node, when SSH snapshot succeeds",
    "# TYPE milady_docker_ps_milady_containers gauge",
]

def esc(v: str) -> str:
    return v.replace('\\', '\\\\').replace('"', '\\"')

print("allocation snapshot:")
print("node_id\thostname\tallocated_before\tdb_live_truth\tdocker_ps_count\talloc_minus_truth\tdocker_minus_truth")
for node in nodes:
    node_id = node["node_id"]
    rows = by_node.get(node_id, [])
    truth = sum(1 for _, _, status in rows if status in live)
    drift = node["allocated"] - truth
    docker_path = tmp / "docker" / f"{node_id}.txt"
    docker_ok = (tmp / "docker-ok" / node_id).exists()
    docker_names = set(docker_path.read_text().splitlines()) if docker_ok else set()
    docker_count = len(docker_names) if docker_ok else None
    docker_delta = (docker_count - truth) if docker_count is not None else None
    print(f"{node_id}\t{node['hostname']}\t{node['allocated']}\t{truth}\t{docker_count if docker_count is not None else 'n/a'}\t{drift}\t{docker_delta if docker_delta is not None else 'n/a'}")
    labels = f'node_id="{esc(node_id)}",hostname="{esc(node["hostname"])}"'
    prom_lines.append(f"milady_allocation_drift{{{labels}}} {drift}")
    prom_lines.append(f"milady_allocation_drift_abs{{{labels}}} {abs(drift)}")
    prom_lines.append(f"milady_db_live_sandboxes{{{labels}}} {truth}")
    if docker_count is not None:
        prom_lines.append(f"milady_docker_ps_milady_containers{{{labels}}} {docker_count}")
    if abs(drift) > 5:
        alerts.append((node_id, node["hostname"], node["allocated"], truth, drift))

print("ghost/zombie snapshot:")
for node in nodes:
    node_id = node["node_id"]
    rows = by_node.get(node_id, [])
    docker_path = tmp / "docker" / f"{node_id}.txt"
    docker_ok = (tmp / "docker-ok" / node_id).exists()
    if not docker_ok:
        print(f"{node_id}: docker snapshot unavailable; skipped ghost/zombie classification")
        continue
    docker_names = set(docker_path.read_text().splitlines())
    all_db = {container: (sid, status) for sid, container, status in rows if container}
    live_db = {container: (sid, status) for sid, container, status in rows if container and status in live}
    ghosts = sorted(set(live_db) - docker_names)
    not_in_db = sorted(docker_names - set(all_db))
    nonlive_running = sorted((container, *all_db[container]) for container in docker_names & set(all_db) if all_db[container][1] not in live)
    if ghosts:
        for container in ghosts:
            sid, status = live_db[container]
            # The docker snapshot intentionally filters name=milady-.  Do not mark
            # or report the manual nyx-node container (`nyx`) as a missing milady
            # container just because it is outside that naming convention; Phase
            # 0b owns that first-class exception.
            if node_id == "nyx-node" and not container.startswith("milady-"):
                print(f"{node_id}: manual non-milady container {container} id={sid} skipped by milady-* docker snapshot")
                continue
            print(f"{node_id}: DB-live missing container {container} id={sid} status={status}")
            if status == "running" and container.startswith("milady-"):
                stale.append((sid, node_id, container))
    else:
        print(f"{node_id}: no DB-live missing containers")
    for container in not_in_db:
        print(f"{node_id}: running container not in DB {container}")
    for container, sid, status in nonlive_running:
        print(f"{node_id}: running container has DB non-live status {container} id={sid} status={status}")

(tmp / "stale_running.tsv").write_text("".join(f"{sid}\t{node}\t{container}\n" for sid, node, container in stale))
(tmp / "drift_alerts.tsv").write_text("".join(f"{node}\t{host}\t{before}\t{truth}\t{drift}\n" for node, host, before, truth, drift in alerts))
prom_tmp = prom_file.with_suffix(prom_file.suffix + ".tmp")
prom_tmp.write_text("\n".join(prom_lines) + "\n")
prom_tmp.replace(prom_file)
PY

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY-RUN: would reconcile docker_nodes.allocated_count to DB live-row truth"
else
  log "Reconciling docker_nodes.allocated_count to DB live-row truth"
  psql_cmd "with truth as (select dn.node_id, coalesce(count(ms.id) filter (where ms.status in ('running','starting','provisioning')),0)::int as truth from public.docker_nodes dn left join public.milady_sandboxes ms on ms.node_id = dn.node_id group by dn.node_id), before as (select node_id, allocated_count from public.docker_nodes), upd as (update public.docker_nodes dn set allocated_count = truth.truth, updated_at = now() from truth join before b on b.node_id = truth.node_id where dn.node_id = truth.node_id and dn.allocated_count is distinct from truth.truth returning dn.node_id, b.allocated_count as before, truth.truth as after) select * from upd order by node_id;"
fi

if [[ -s "$tmp/stale_running.tsv" ]]; then
  while IFS=$'\t' read -r sid node_id container_name; do
    if [[ "$DRY_RUN" == "1" ]]; then
      log "DRY-RUN: would mark stale running sandbox error id=$sid node=$node_id container=$container_name"
    else
      log "Marking stale running sandbox error id=$sid node=$node_id container=$container_name"
      psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v sid="$sid" -P pager=off -c "update public.milady_sandboxes set status='error', error_message=concat_ws(E'\n', nullif(error_message,''), 'reconcile-allocations: status=running but docker ps snapshot did not show container on node'), updated_at=now() where id = :'sid'::uuid and status='running' returning id,node_id,container_name,status;"
    fi
  done < "$tmp/stale_running.tsv"
else
  log "No stale status=running DB rows with missing containers found on successfully checked nodes"
fi

if [[ -s "$tmp/drift_alerts.tsv" ]]; then
  while IFS=$'\t' read -r node_id hostname before truth drift; do
    if [[ "$DRY_RUN" == "1" || "$SEND_ALERTS" == "0" ]]; then
      log "DRY-RUN/no-alert: would fire allocation drift alert node=$node_id before=$before truth=$truth drift=$drift"
      continue
    fi
    payload=$(python3 - "$node_id" "$hostname" "$before" "$truth" "$drift" <<'PY'
import json, sys, datetime
node, host, before, truth, drift = sys.argv[1:]
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
print(json.dumps([{
    "labels": {
        "alertname": "MiladyAllocationDriftHigh",
        "severity": "warning",
        "node_id": node,
        "instance": host,
        "source": "reconcile-allocations",
    },
    "annotations": {
        "summary": f"Milady allocation drift >5 on {node}",
        "description": f"docker_nodes.allocated_count was {before}; DB live-row truth is {truth}; drift={drift}. Reconciler is correcting the stored count.",
    },
    "startsAt": now,
}]))
PY
)
    if curl -fsS -X POST -H 'Content-Type: application/json' --data "$payload" "$ALERTMANAGER_URL/api/v2/alerts" >/dev/null; then
      log "Fired allocation drift alert node=$node_id before=$before truth=$truth drift=$drift"
    else
      log "WARN failed to fire allocation drift alert node=$node_id"
    fi
  done < "$tmp/drift_alerts.tsv"
else
  log "No per-node allocation drift >5 detected"
fi

psql_tsv "select dn.node_id, dn.allocated_count, coalesce(count(ms.id) filter (where ms.status in ('running','starting','provisioning')),0)::int as truth, dn.allocated_count - coalesce(count(ms.id) filter (where ms.status in ('running','starting','provisioning')),0)::int as delta from public.docker_nodes dn left join public.milady_sandboxes ms on ms.node_id=dn.node_id group by dn.node_id,dn.allocated_count order by dn.node_id" | sed 's/^/verify\t/'
log "DONE"
