import { K8s, Log } from "pepr";
import { Server } from "./crd/generated/server-v1alpha1";
import { applyResources } from "./controller/generators";
import {
  setServerState,
  setAgentServer,
  removeAgentServer,
  cleanupServer,
} from "./redis";

export async function reconciler(instance: Server) {
  const name = instance.metadata?.name;
  const ns = instance.metadata?.namespace ?? "eliza-agents";
  const generation = instance.metadata?.generation ?? 0;
  const observed = instance.status?.observedGeneration ?? 0;

  if (!name) {
    Log.warn("Server CR missing metadata.name, skipping");
    return;
  }

  // Skip if CR is being deleted (finalizer handles cleanup)
  if (instance.metadata?.deletionTimestamp) {
    Log.debug(`Server ${name}: being deleted, skipping reconcile`);
    return;
  }

  if (observed >= generation && generation > 0) {
    Log.debug(`Server ${name}: generation ${generation} already reconciled`);
    return;
  }

  Log.info(`Reconciling Server ${name} (gen ${generation})`);

  try {
    // Apply K8s resources (Deployment, Service, ScaledObject)
    await applyResources(instance);
    Log.info(`Server ${name}: K8s resources applied`);

    // Update Redis state
    const url = `http://${name}.${ns}.svc:3000`;
    await setServerState(name, "pending", url);

    // Set agent→server mappings
    const agents = instance.spec.agents ?? [];
    const currentAgentIds = agents.map((a) => a.agentId);
    for (const agent of agents) {
      await setAgentServer(agent.agentId, name);
    }

    // Remove stale agent mappings (agents removed from spec)
    const previousAgentIds = getPreviousAgentIds(instance);
    const removedAgents = previousAgentIds.filter(
      (id) => !currentAgentIds.includes(id),
    );
    for (const agentId of removedAgents) {
      await removeAgentServer(agentId);
      Log.info(`Server ${name}: removed agent mapping ${agentId}`);
    }

    // Update CR status
    await updateStatus(instance, {
      phase: "Pending",
      readyAgents: 0,
      totalAgents: agents.length,
      replicas: 0,
      podNames: [],
      lastActivity: new Date().toISOString(),
      observedGeneration: generation,
    });

    Log.info(`Server ${name}: reconciliation complete`);
  } catch (err) {
    Log.error(err, `Server ${name}: reconciliation failed`);
  }
}

export async function finalizer(instance: Server) {
  const name = instance.metadata?.name;
  if (!name) return;

  Log.info(`Finalizing Server ${name}: cleaning up Redis`);

  const agentIds = instance.spec?.agents?.map((a) => a.agentId) ?? [];
  await cleanupServer(name, agentIds);

  Log.info(`Server ${name}: Redis cleanup complete`);
}

function getPreviousAgentIds(instance: Server): string[] {
  const annotation =
    instance.metadata?.annotations?.["eliza.ai/previous-agents"];
  if (!annotation) return [];
  try {
    return JSON.parse(annotation);
  } catch {
    return [];
  }
}

async function updateStatus(instance: Server, status: Server["status"]) {
  try {
    await K8s(Server).PatchStatus({
      metadata: {
        name: instance.metadata!.name!,
        namespace: instance.metadata!.namespace ?? "eliza-agents",
      },
      status,
    });
  } catch (err) {
    Log.error(err, `Failed to update status for ${instance.metadata?.name}`);
  }
}
