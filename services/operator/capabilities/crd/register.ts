import { K8s, Log, kind } from "pepr";
import { ServerCRD } from "./source/server.crd";

export function RegisterCRD() {
  K8s(kind.CustomResourceDefinition)
    .Apply(ServerCRD, { force: true })
    .then(() => Log.info("Server CRD registered"))
    .catch((err) => {
      Log.error(err, "Failed to register Server CRD");
      process.exit(1);
    });
}

RegisterCRD();
