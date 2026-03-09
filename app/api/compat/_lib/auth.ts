/**
 * Auth helper for compat routes.
 *
 * Auth priority:
 *   1. X-Service-Key header (existing S2S auth for milady-cloud)
 *   2. Service JWT in Authorization header (waifu-core bridge)
 *   3. Standard Privy/API-key auth (dashboard users)
 */

import { NextRequest } from "next/server";
import { validateServiceKey } from "@/lib/auth/service-key";
import { authenticateWaifuBridge } from "@/lib/auth/waifu-bridge";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import type { Organization } from "@/db/schemas/organizations";

export interface CompatAuthResult {
  user: {
    id: string;
    organization_id: string;
    organization?: Organization;
  };
  authMethod: "service_key" | "service_jwt" | "standard";
}

/**
 * Authenticate a compat route request.
 */
export async function requireCompatAuth(
  request: NextRequest,
): Promise<CompatAuthResult> {
  // 1. X-Service-Key (milady-cloud S2S)
  const serviceKeyIdentity = validateServiceKey(request);
  if (serviceKeyIdentity) {
    return {
      user: {
        id: serviceKeyIdentity.userId,
        organization_id: serviceKeyIdentity.organizationId,
      },
      authMethod: "service_key",
    };
  }

  // 2. Service JWT (waifu-core bridge)
  const bridge = await authenticateWaifuBridge(request);
  if (bridge) {
    return {
      user: bridge.user,
      authMethod: "service_jwt",
    };
  }

  // 3. Standard auth (Privy / API key)
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  return {
    user,
    authMethod: "standard",
  };
}
