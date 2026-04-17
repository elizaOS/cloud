import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { dbRead, dbWrite } from "@/db/helpers";
import {
  type MiladyBackupSnapshotType,
  type MiladySandbox,
  type MiladySandboxBackup,
  type MiladySandboxStatus,
  miladySandboxBackups,
  miladySandboxes,
  type NewMiladySandbox,
  type NewMiladySandboxBackup,
} from "@/db/schemas/milady-sandboxes";
import { MILADY_MANAGED_DISCORD_KEY } from "@/lib/services/milady-agent-config";

export type {
  MiladyBackupSnapshotType,
  MiladySandbox,
  MiladySandboxBackup,
  MiladySandboxStatus,
  NewMiladySandbox,
  NewMiladySandboxBackup,
};

export class MiladySandboxesRepository {
  // Reads

  async findById(id: string): Promise<MiladySandbox | undefined> {
    const [r] = await dbRead
      .select()
      .from(miladySandboxes)
      .where(eq(miladySandboxes.id, id))
      .limit(1);
    return r;
  }

  async findByIdAndOrg(
    id: string,
    orgId: string,
  ): Promise<MiladySandbox | undefined> {
    const [r] = await dbRead
      .select()
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.id, id),
          eq(miladySandboxes.organization_id, orgId),
        ),
      )
      .limit(1);
    return r;
  }

  async findByIdAndOrgForWrite(
    id: string,
    orgId: string,
  ): Promise<MiladySandbox | undefined> {
    const [r] = await dbWrite
      .select()
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.id, id),
          eq(miladySandboxes.organization_id, orgId),
        ),
      )
      .limit(1);
    return r;
  }

  async listByOrganization(orgId: string): Promise<MiladySandbox[]> {
    return dbRead
      .select()
      .from(miladySandboxes)
      .where(eq(miladySandboxes.organization_id, orgId))
      .orderBy(desc(miladySandboxes.created_at));
  }

  async findBySandboxId(sandboxId: string): Promise<MiladySandbox | undefined> {
    const [r] = await dbRead
      .select()
      .from(miladySandboxes)
      .where(eq(miladySandboxes.sandbox_id, sandboxId))
      .limit(1);
    return r;
  }

  /** List active (non-terminal) sandboxes on a specific docker node. */
  async listByNodeId(nodeId: string): Promise<MiladySandbox[]> {
    const terminalStatuses: MiladySandboxStatus[] = ["stopped", "error"];
    return dbRead
      .select()
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.node_id, nodeId),
          notInArray(miladySandboxes.status, terminalStatuses),
        ),
      );
  }

  async findRunningSandbox(
    id: string,
    orgId: string,
  ): Promise<MiladySandbox | undefined> {
    // Use dbWrite (primary) instead of dbRead (replica) to ensure fresh data.
    // The VPS worker writes bridge_url/status to primary, and read replicas
    // may lag behind, causing the wallet proxy to return "not running".
    const [r] = await dbWrite
      .select()
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.id, id),
          eq(miladySandboxes.organization_id, orgId),
          eq(miladySandboxes.status, "running"),
        ),
      )
      .limit(1);
    return r;
  }

  async findByManagedDiscordGuildId(guildId: string): Promise<MiladySandbox[]> {
    const trimmedGuildId = guildId.trim();
    if (!trimmedGuildId) {
      return [];
    }

    const result = await dbWrite.execute<MiladySandbox>(sql`
      SELECT *
      FROM ${miladySandboxes}
      WHERE (${miladySandboxes.agent_config} -> ${MILADY_MANAGED_DISCORD_KEY} ->> 'guildId') = ${trimmedGuildId}
      ORDER BY ${miladySandboxes.updated_at} DESC
    `);

    return result.rows;
  }

  // Writes

  async create(data: NewMiladySandbox): Promise<MiladySandbox> {
    const [r] = await dbWrite.insert(miladySandboxes).values(data).returning();
    if (!r) throw new Error("Failed to create Milady sandbox record");
    return r;
  }

  async update(
    id: string,
    data: Partial<NewMiladySandbox>,
  ): Promise<MiladySandbox | undefined> {
    const [r] = await dbWrite
      .update(miladySandboxes)
      .set({ ...data, updated_at: new Date() })
      .where(eq(miladySandboxes.id, id))
      .returning();
    return r;
  }

  /** Atomically set provisioning — only from pending/stopped/disconnected/error. */
  async trySetProvisioning(id: string): Promise<MiladySandbox | undefined> {
    const [r] = await dbWrite
      .update(miladySandboxes)
      .set({
        status: "provisioning",
        updated_at: new Date(),
        error_message: null,
      })
      .where(
        and(
          eq(miladySandboxes.id, id),
          sql`${miladySandboxes.status} IN ('pending', 'stopped', 'disconnected', 'error')`,
        ),
      )
      .returning();
    return r;
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    const r = await dbWrite
      .delete(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.id, id),
          eq(miladySandboxes.organization_id, orgId),
        ),
      )
      .returning({ id: miladySandboxes.id });
    return r.length > 0;
  }

  // Backups

  async createBackup(
    data: NewMiladySandboxBackup,
  ): Promise<MiladySandboxBackup> {
    const [r] = await dbWrite
      .insert(miladySandboxBackups)
      .values(data)
      .returning();
    if (!r) throw new Error("Failed to create backup");
    return r;
  }

  async listBackups(
    sandboxRecordId: string,
    limit = 10,
  ): Promise<MiladySandboxBackup[]> {
    return dbRead
      .select()
      .from(miladySandboxBackups)
      .where(eq(miladySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(miladySandboxBackups.created_at))
      .limit(limit);
  }

  async getLatestBackup(
    sandboxRecordId: string,
  ): Promise<MiladySandboxBackup | undefined> {
    const [r] = await dbRead
      .select()
      .from(miladySandboxBackups)
      .where(eq(miladySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(miladySandboxBackups.created_at))
      .limit(1);
    return r;
  }

  async getBackupById(
    backupId: string,
  ): Promise<MiladySandboxBackup | undefined> {
    const [r] = await dbRead
      .select()
      .from(miladySandboxBackups)
      .where(eq(miladySandboxBackups.id, backupId))
      .limit(1);
    return r;
  }

  async pruneBackups(sandboxRecordId: string, keep: number): Promise<number> {
    const all = await dbRead
      .select({ id: miladySandboxBackups.id })
      .from(miladySandboxBackups)
      .where(eq(miladySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(miladySandboxBackups.created_at));
    if (all.length <= keep) return 0;
    const ids = all.slice(keep).map((b) => b.id);
    const r = await dbWrite
      .delete(miladySandboxBackups)
      .where(inArray(miladySandboxBackups.id, ids))
      .returning({ id: miladySandboxBackups.id });
    return r.length;
  }
}

export const miladySandboxesRepository = new MiladySandboxesRepository();
