import { Capability, a, Log, K8s } from "pepr";
import { Server } from "./crd/generated/server-v1alpha1";
import { reconciler, finalizer } from "./reconciler";
import { applyResources } from "./controller/generators";
import { validator } from "./crd/validator";
import "./crd/register";

export const ServerController = new Capability({
  name: "server-controller",
  description: "Manages ElizaOS Server resources",
  namespaces: ["eliza-agents"],
});

const { When } = ServerController;

// Validate Server CRs before admission
When(Server)
  .IsCreatedOrUpdated()
  .InNamespace("eliza-agents")
  .Validate(validator);

// Main reconciliation loop: watch Server CRs
When(Server)
  .IsCreatedOrUpdated()
  .InNamespace("eliza-agents")
  .Reconcile(async (instance) => {
    await reconciler(instance);
  })
  .Finalize(async (instance) => {
    await finalizer(instance);
  });

// Self-healing: re-deploy Deployments if deleted externally
When(a.Deployment)
  .IsDeleted()
  .InNamespace("eliza-agents")
  .WithLabel("eliza.ai/managed-by", "server-operator")
  .Watch(async (deploy) => {
    const serverName = deploy.metadata?.labels?.["eliza.ai/server"];
    if (!serverName) return;

    try {
      const server = await K8s(Server)
        .InNamespace("eliza-agents")
        .Get(serverName);
      // Skip if CR is being deleted (ownerReferences cascade is expected)
      if (server.metadata?.deletionTimestamp) return;
      Log.info(`Deployment ${serverName} deleted externally, re-reconciling`);
      await applyResources(server);
    } catch (err: any) {
      if (err?.status === 404) return; // CR deleted, nothing to re-reconcile
      Log.error(err, `Failed to re-reconcile Server ${serverName}`);
    }
  });

// Self-healing: re-deploy Services if deleted externally
When(a.Service)
  .IsDeleted()
  .InNamespace("eliza-agents")
  .WithLabel("eliza.ai/managed-by", "server-operator")
  .Watch(async (svc) => {
    const serverName = svc.metadata?.labels?.["eliza.ai/server"];
    if (!serverName) return;

    try {
      const server = await K8s(Server)
        .InNamespace("eliza-agents")
        .Get(serverName);
      // Skip if CR is being deleted (ownerReferences cascade is expected)
      if (server.metadata?.deletionTimestamp) return;
      Log.info(`Service ${serverName} deleted externally, re-reconciling`);
      await applyResources(server);
    } catch (err: any) {
      if (err?.status === 404) return; // CR deleted, nothing to re-reconcile
      Log.error(err, `Failed to re-reconcile Server ${serverName}`);
    }
  });
