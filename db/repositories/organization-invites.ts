import { and, eq } from "drizzle-orm";
import { db } from "../client";
import {
  organizationInvites,
  type OrganizationInvite,
  type NewOrganizationInvite,
} from "../schemas/organization-invites";

export type { OrganizationInvite, NewOrganizationInvite };

export class OrganizationInvitesRepository {
  async findById(id: string): Promise<OrganizationInvite | undefined> {
    return await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.id, id),
    });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<OrganizationInvite | undefined> {
    return await db.query.organizationInvites.findFirst({
      where: eq(organizationInvites.token_hash, tokenHash),
      with: {
        organization: true,
        inviter: true,
      },
    });
  }

  async findPendingInviteByEmail(
    email: string,
  ): Promise<OrganizationInvite | undefined> {
    return await db.query.organizationInvites.findFirst({
      where: and(
        eq(organizationInvites.invited_email, email.toLowerCase()),
        eq(organizationInvites.status, "pending"),
      ),
      with: {
        organization: true,
      },
    });
  }

  async listByOrganization(
    organizationId: string,
  ): Promise<OrganizationInvite[]> {
    return await db.query.organizationInvites.findMany({
      where: eq(organizationInvites.organization_id, organizationId),
      with: {
        inviter: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: (invites, { desc }) => [desc(invites.created_at)],
    });
  }

  async listPendingByOrganization(
    organizationId: string,
  ): Promise<OrganizationInvite[]> {
    return await db.query.organizationInvites.findMany({
      where: and(
        eq(organizationInvites.organization_id, organizationId),
        eq(organizationInvites.status, "pending"),
      ),
      with: {
        inviter: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: (invites, { desc }) => [desc(invites.created_at)],
    });
  }

  async create(
    data: NewOrganizationInvite,
  ): Promise<OrganizationInvite> {
    const [invite] = await db
      .insert(organizationInvites)
      .values(data)
      .returning();
    return invite;
  }

  async update(
    id: string,
    data: Partial<NewOrganizationInvite>,
  ): Promise<OrganizationInvite | undefined> {
    const [updated] = await db
      .update(organizationInvites)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(organizationInvites.id, id))
      .returning();
    return updated;
  }

  async revoke(id: string): Promise<OrganizationInvite | undefined> {
    return await this.update(id, {
      status: "revoked",
    });
  }

  async markAsAccepted(
    id: string,
    acceptedByUserId: string,
  ): Promise<OrganizationInvite | undefined> {
    return await this.update(id, {
      status: "accepted",
      accepted_at: new Date(),
      accepted_by_user_id: acceptedByUserId,
    });
  }

  async markAsExpired(id: string): Promise<OrganizationInvite | undefined> {
    return await this.update(id, {
      status: "expired",
    });
  }

  async delete(id: string): Promise<void> {
    await db.delete(organizationInvites).where(eq(organizationInvites.id, id));
  }
}

export const organizationInvitesRepository =
  new OrganizationInvitesRepository();
