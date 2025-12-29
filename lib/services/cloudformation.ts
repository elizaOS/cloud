/**
 * CloudFormation Service Compatibility Layer
 *
 * This module re-exports the DWS container service with a CloudFormation-compatible API.
 * It provides backwards compatibility for existing code that uses CloudFormation.
 *
 * For new code, prefer using the DWS container service directly:
 * import { getDWSContainerService } from "@/lib/services/dws/containers";
 */

export {
  CloudFormationService,
  cloudFormationService,
  type ContainerStackConfig as UserStackConfig,
  type ContainerStackOutputs as StackOutputs,
  type ContainerStackStatus,
} from "@/lib/services/dws/containers";
