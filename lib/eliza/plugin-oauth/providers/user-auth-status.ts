/**
 * USER_AUTH_STATUS Provider
 *
 * Injects user authentication status into agent context.
 * Shows which OAuth platforms are connected and credits balance.
 */

import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from "@elizaos/core";
import { usersRepository } from "@/db/repositories/users";
import { oauthService } from "@/lib/services/oauth";

export const userAuthStatusProvider: Provider = {
  name: "USER_AUTH_STATUS",
  description: "Provides user OAuth connection status and credits balance",

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<ProviderResult> => {
    if (!message.entityId) {
      return {
        text: "",
        values: {},
        data: {},
      };
    }

    const user = await usersRepository.findWithOrganization(message.entityId as string);

    if (!user || !user.organization_id) {
      logger.debug(`[USER_AUTH_STATUS] No user/org found for entityId: ${message.entityId}`);
      return {
        text: "# User Status\n- Status: Unknown user",
        values: {
          userAuthenticated: false,
          hasOrganization: false,
        },
        data: {
          userAuthStatus: {
            authenticated: false,
            connections: [],
          },
        },
      };
    }

    const organizationId = user.organization_id;
    const connections = await oauthService.listConnections({ organizationId });
    const activeConnections = connections.filter((c) => c.status === "active");

    const creditBalance = user.organization?.credit_balance
      ? parseFloat(user.organization.credit_balance)
      : 0;

    const hasGoogle = activeConnections.some((c) => c.platform === "google");
    const googleConnection = activeConnections.find((c) => c.platform === "google");

    const connectionsList =
      activeConnections.length > 0
        ? activeConnections
            .map((c) => {
              const name = c.platform.charAt(0).toUpperCase() + c.platform.slice(1);
              const identifier = c.email || c.username || "";
              return identifier ? `${name} (${identifier})` : name;
            })
            .join(", ")
        : "None";

    let status: string;
    if (activeConnections.length === 0) {
      status = "Not authenticated - needs to connect Google";
    } else if (creditBalance <= 0) {
      status = "Authenticated but no credits";
    } else {
      status = "Fully authenticated";
    }

    const text = `# User Authentication Status
- Connections: ${connectionsList}
- Credits: ${creditBalance.toFixed(2)}
- Status: ${status}`;

    logger.debug(
      `[USER_AUTH_STATUS] User ${user.id}: ${activeConnections.length} connections, ${creditBalance} credits`
    );

    return {
      text,
      values: {
        userAuthenticated: activeConnections.length > 0,
        hasGoogleConnected: hasGoogle,
        googleEmail: googleConnection?.email || null,
        creditBalance,
        hasCredits: creditBalance > 0,
        connectionCount: activeConnections.length,
        connectedPlatforms: activeConnections.map((c) => c.platform),
        authStatus: status,
      },
      data: {
        userAuthStatus: {
          authenticated: activeConnections.length > 0,
          userId: user.id,
          organizationId,
          creditBalance,
          connections: activeConnections.map((c) => ({
            platform: c.platform,
            email: c.email,
            username: c.username,
            status: c.status,
          })),
        },
      },
    };
  },
};
