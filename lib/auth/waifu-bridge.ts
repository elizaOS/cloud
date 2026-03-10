/**
 * Waifu Bridge Auth — resolves waifu-core service JWTs to eliza-cloud user+org.
 */

import { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import {
  verifyServiceJwt,
  isServiceJwtEnabled,
  type ServiceJwtPayload,
} from "./service-jwt";
import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import type { UserWithOrganization } from "@/lib/types";
import type { Organization } from "@/db/schemas/organizations";
import { ForbiddenError } from "@/lib/api/errors";
import crypto from "crypto";

export interface WaifuBridgeAuthResult {
  user: UserWithOrganization & {
    organization_id: string;
    organization: Organization;
  };
  servicePayload: ServiceJwtPayload;
  authMethod: "service_jwt";
}

/**
 * Authenticate a request from waifu-core via service JWT.
 * Returns the resolved user+org or null.
 */
export async function authenticateWaifuBridge(
  request: NextRequest,
): Promise<WaifuBridgeAuthResult | null> {
  if (!isServiceJwtEnabled()) return null;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const payload = await verifyServiceJwt(authHeader);
  if (!payload) return null;

  logger.info("[waifu-bridge] Authenticated service JWT", {
    userId: payload.userId,
    tier: payload.tier,
  });

  const user = await resolveServiceUser(payload);

  return {
    user,
    servicePayload: payload,
    authMethod: "service_jwt",
  };
}

function serviceIdFromUserId(userId: string): string {
  return `svc_${userId.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`;
}

function slugFromUserId(userId: string): string {
  const base = userId
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase()
    .slice(0, 40);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${base}-${rand}`;
}

export function canAutoCreateWaifuBridgeOrg(): boolean {
  if (process.env.WAIFU_BRIDGE_ALLOW_ORG_AUTO_CREATE === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

/**
 * Resolve a service JWT userId to an eliza-cloud user with org.
 */
async function resolveServiceUser(
  payload: ServiceJwtPayload,
): Promise<WaifuBridgeAuthResult["user"]> {
  const pinnedOrgId = process.env.WAIFU_BRIDGE_ORG_ID;
  const serviceId = serviceIdFromUserId(payload.userId);

  // 1. Try existing user by serviceId
  const user = await usersService.getByPrivyId(serviceId);
  if (user?.organization_id && user?.organization) {
    return user as WaifuBridgeAuthResult["user"];
  }

  // 2. Try wallet address match
  const walletMatch = payload.userId.match(/^waifu:(0x[a-fA-F0-9]{40})$/);
  if (walletMatch) {
    const walletUser = await usersService.getByWalletAddressWithOrganization(
      walletMatch[1].toLowerCase(),
    );
    if (walletUser?.organization_id && walletUser?.organization) {
      await usersService.update(walletUser.id, { privy_user_id: serviceId });
      return walletUser as WaifuBridgeAuthResult["user"];
    }
  }

  // 3. Auto-provision
  logger.info("[waifu-bridge] Auto-provisioning service user", {
    serviceId,
    userId: payload.userId,
  });

  let orgId = pinnedOrgId;

  if (!orgId) {
    if (!canAutoCreateWaifuBridgeOrg()) {
      throw new ForbiddenError(
        "WAIFU_BRIDGE_ORG_ID must be configured before provisioning waifu bridge users in production",
      );
    }

    const slug = slugFromUserId(payload.userId);
    const orgName = payload.userId.startsWith("waifu:")
      ? `waifu-${payload.userId.slice(6, 14)}`
      : "waifu-svc";

    const org = await organizationsService.create({
      name: orgName,
      slug,
    });
    orgId = org.id;
  }

  const email = payload.email ?? `${serviceId}@waifu.bridge`;
  const walletAddr = walletMatch ? walletMatch[1].toLowerCase() : undefined;

  const newUser = await usersService.create({
    privy_user_id: serviceId,
    email,
    organization_id: orgId,
    wallet_address: walletAddr,
    wallet_verified: !!walletAddr,
    is_active: true,
  });

  const fullUser = await usersService.getWithOrganization(newUser.id);
  if (!fullUser?.organization_id || !fullUser?.organization) {
    throw new ForbiddenError(
      "Failed to provision service account for waifu-core bridge",
    );
  }

  return fullUser as WaifuBridgeAuthResult["user"];
}
