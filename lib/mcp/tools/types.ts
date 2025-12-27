/**
 * Shared types for MCP tools
 */

import type { AuthResult, Organization } from "@/lib/auth";
import type { UserWithOrganization } from "@/lib/types";

/**
 * Auth result with guaranteed organization context
 */
export type AuthResultWithOrg = AuthResult & {
  user: UserWithOrganization & {
    organization_id: string;
    organization: Organization;
  };
};

/**
 * MCP tool response content
 */
export interface ToolContent {
  type: "text";
  text: string;
}

/**
 * MCP tool response
 */
export interface ToolResponse {
  content: ToolContent[];
  isError?: boolean;
}

/**
 * Helper to create a success response
 */
export function successResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Helper to create an error response
 */
export function errorResponse(error: unknown): ToolResponse {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [
      { type: "text", text: JSON.stringify({ error: message }, null, 2) },
    ],
    isError: true,
  };
}
