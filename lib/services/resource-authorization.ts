/**
 * Resource Authorization Service
 * Verifies user access to resources in SSE streams and API endpoints
 */

import { dbRead } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { containers } from "@/db/schemas/containers";
import { organizations } from "@/db/schemas/organizations";
import { participantTable, roomTable } from "@/db/schemas/eliza";
import { users } from "@/db/schemas/users";

/**
 * Parameters for resource access verification.
 */
export interface ResourceAccessParams {
  organizationId: string;
  userId: string;
  eventType: string;
  resourceId: string;
}

/**
 * Verifies if a user has access to a specific resource based on event type.
 *
 * @param params - Resource access parameters.
 * @returns True if access is granted.
 * @throws Error if resource access is denied.
 */
export async function verifyResourceAccess(
  params: ResourceAccessParams,
): Promise<boolean> {
  const { organizationId, userId, eventType, resourceId } = params;

  switch (eventType) {
    case "agent": {
      // For agent events, resourceId is the roomId (Eliza room)
      // Verify the user is a participant in the room
      const participant = await dbRead
        .select({ entityId: participantTable.entityId })
        .from(participantTable)
        .where(
          and(
            eq(participantTable.roomId, resourceId),
            eq(participantTable.entityId, userId),
          ),
        )
        .limit(1);

      if (participant.length > 0) {
        return true;
      }

      // Fallback: Check if user is the room creator (stored in metadata)
      const room = await dbRead
        .select({ metadata: roomTable.metadata })
        .from(roomTable)
        .where(eq(roomTable.id, resourceId))
        .limit(1);

      if (room.length > 0) {
        const metadata = room[0].metadata as { creatorUserId?: string } | null;
        if (metadata?.creatorUserId === userId) {
          return true;
        }
      }

      // Also verify the room's agent belongs to the organization
      const roomWithOrg = await dbRead
        .select({ agentId: roomTable.agentId })
        .from(roomTable)
        .innerJoin(users, eq(users.id, userId))
        .where(
          and(
            eq(roomTable.id, resourceId),
            eq(users.organization_id, organizationId),
          ),
        )
        .limit(1);

      return roomWithOrg.length > 0;
    }

    case "credits": {
      // For credit events, resourceId should be the organization ID
      if (resourceId !== organizationId) {
        return false;
      }
      return true;
    }

    case "container": {
      // For container events, verify container belongs to organization
      const container = await dbRead
        .select()
        .from(containers)
        .where(
          and(
            eq(containers.id, resourceId),
            eq(containers.organization_id, organizationId),
          ),
        )
        .limit(1);

      if (!container || container.length === 0) {
        return false;
      }
      return true;
    }

    default:
      // Unknown event type, deny access
      return false;
  }
}

/**
 * Verifies organization exists and user has access.
 *
 * @param organizationId - Organization ID to verify.
 * @returns True if organization exists.
 */
export async function verifyOrganizationAccess(
  organizationId: string,
): Promise<boolean> {
  const org = await dbRead.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { id: true },
  });

  return !!org;
}
