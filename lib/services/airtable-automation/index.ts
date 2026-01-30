/**
 * Airtable Automation Service
 *
 * Handles credential management and API operations for Airtable.
 * Uses Personal Access Tokens for authentication.
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

// Secret names
const SECRET_NAMES = {
  ACCESS_TOKEN: "AIRTABLE_ACCESS_TOKEN",
  USER_ID: "AIRTABLE_USER_ID",
  EMAIL: "AIRTABLE_EMAIL",
};

export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

export interface AirtableConnectionStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  userId?: string;
  error?: string;
}

// Cache for status checks (5 minute TTL)
const statusCache = new Map<
  string,
  { status: AirtableConnectionStatus; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

class AirtableAutomationService {
  /**
   * Airtable is always "configured" since it uses user-provided tokens
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Validate an Airtable Personal Access Token
   */
  async validateToken(
    token: string
  ): Promise<{ valid: boolean; email?: string; userId?: string; error?: string }> {
    try {
      const response = await fetch("https://api.airtable.com/v0/meta/whoami", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          valid: false,
          error: errorData.error?.message || "Invalid token",
        };
      }

      const data = await response.json();
      return {
        valid: true,
        email: data.email,
        userId: data.id,
      };
    } catch (error) {
      logger.error("[Airtable] Token validation error:", error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  /**
   * Store Airtable credentials
   */
  async storeCredentials(
    organizationId: string,
    userId: string,
    credentials: {
      accessToken: string;
      email?: string;
      airtableUserId?: string;
    }
  ): Promise<void> {
    const audit = {
      action: "airtable_connect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { email: credentials.email },
    };

    // Remove existing credentials first
    await this.removeCredentials(organizationId, userId);

    // Store new credentials
    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.ACCESS_TOKEN,
        value: credentials.accessToken,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    if (credentials.email) {
      await secretsService.create(
        {
          organizationId,
          name: SECRET_NAMES.EMAIL,
          value: credentials.email,
          scope: "organization",
          createdBy: userId,
        },
        audit
      );
    }

    if (credentials.airtableUserId) {
      await secretsService.create(
        {
          organizationId,
          name: SECRET_NAMES.USER_ID,
          value: credentials.airtableUserId,
          scope: "organization",
          createdBy: userId,
        },
        audit
      );
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Remove Airtable credentials
   */
  async removeCredentials(
    organizationId: string,
    userId: string
  ): Promise<void> {
    const audit = {
      action: "airtable_disconnect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: {},
    };

    for (const secretName of Object.values(SECRET_NAMES)) {
      try {
        await secretsService.deleteByName(organizationId, secretName, audit);
      } catch {
        // Ignore if doesn't exist
      }
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(
    organizationId: string
  ): Promise<AirtableConnectionStatus> {
    // Check cache
    const cached = statusCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status;
    }

    try {
      const accessToken = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.ACCESS_TOKEN
      );
      const email = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.EMAIL
      );
      const userId = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.USER_ID
      );

      if (!accessToken) {
        const status: AirtableConnectionStatus = {
          configured: true,
          connected: false,
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      // Verify token is still valid
      const validation = await this.validateToken(accessToken);

      if (!validation.valid) {
        const status: AirtableConnectionStatus = {
          configured: true,
          connected: false,
          error: "Token expired or revoked",
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      const status: AirtableConnectionStatus = {
        configured: true,
        connected: true,
        email: email || validation.email,
        userId: userId || validation.userId,
      };

      statusCache.set(organizationId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      logger.error("[Airtable] Error getting connection status:", error);
      return {
        configured: true,
        connected: false,
        error: "Failed to check connection status",
      };
    }
  }

  /**
   * List all bases the user has access to
   */
  async listBases(organizationId: string): Promise<AirtableBase[]> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return [];
    }

    try {
      const response = await fetch(
        "https://api.airtable.com/v0/meta/bases",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Airtable] Failed to list bases:", data);
        return [];
      }

      return data.bases.map((base: { id: string; name: string; permissionLevel: string }) => ({
        id: base.id,
        name: base.name,
        permissionLevel: base.permissionLevel,
      }));
    } catch (error) {
      logger.error("[Airtable] Error listing bases:", error);
      return [];
    }
  }

  /**
   * List tables in a base
   */
  async listTables(
    organizationId: string,
    baseId: string
  ): Promise<AirtableTable[]> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return [];
    }

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Airtable] Failed to list tables:", data);
        return [];
      }

      return data.tables;
    } catch (error) {
      logger.error("[Airtable] Error listing tables:", error);
      return [];
    }
  }

  /**
   * List records in a table
   */
  async listRecords(
    organizationId: string,
    baseId: string,
    tableIdOrName: string,
    options?: {
      maxRecords?: number;
      filterByFormula?: string;
      sort?: Array<{ field: string; direction: "asc" | "desc" }>;
    }
  ): Promise<AirtableRecord[]> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      if (options?.maxRecords) {
        params.set("maxRecords", options.maxRecords.toString());
      }
      if (options?.filterByFormula) {
        params.set("filterByFormula", options.filterByFormula);
      }
      if (options?.sort) {
        options.sort.forEach((s, i) => {
          params.set(`sort[${i}][field]`, s.field);
          params.set(`sort[${i}][direction]`, s.direction);
        });
      }

      const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Airtable] Failed to list records:", data);
        return [];
      }

      return data.records;
    } catch (error) {
      logger.error("[Airtable] Error listing records:", error);
      return [];
    }
  }

  /**
   * Create records in a table
   */
  async createRecords(
    organizationId: string,
    baseId: string,
    tableIdOrName: string,
    records: Array<{ fields: Record<string, unknown> }>
  ): Promise<{ success: boolean; records?: AirtableRecord[]; error?: string }> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return { success: false, error: "Airtable not connected" };
    }

    try {
      const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records }),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Airtable] Failed to create records:", data);
        return { success: false, error: data.error?.message || "Failed to create records" };
      }

      return { success: true, records: data.records };
    } catch (error) {
      logger.error("[Airtable] Error creating records:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create records",
      };
    }
  }

  /**
   * Update records in a table
   */
  async updateRecords(
    organizationId: string,
    baseId: string,
    tableIdOrName: string,
    records: Array<{ id: string; fields: Record<string, unknown> }>
  ): Promise<{ success: boolean; records?: AirtableRecord[]; error?: string }> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return { success: false, error: "Airtable not connected" };
    }

    try {
      const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}`;

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records }),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Airtable] Failed to update records:", data);
        return { success: false, error: data.error?.message || "Failed to update records" };
      }

      return { success: true, records: data.records };
    } catch (error) {
      logger.error("[Airtable] Error updating records:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update records",
      };
    }
  }

  /**
   * Invalidate cached status
   */
  invalidateStatusCache(organizationId: string): void {
    statusCache.delete(organizationId);
  }
}

export const airtableAutomationService = new AirtableAutomationService();
