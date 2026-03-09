import { dbRead, dbWrite } from "@/db/helpers";
import {
  milaidySandboxes, milaidySandboxBackups,
  type MilaidySandbox, type NewMilaidySandbox,
  type MilaidySandboxBackup, type NewMilaidySandboxBackup,
  type MilaidySandboxStatus, type MilaidyBackupSnapshotType,
} from "@/db/schemas/milaidy-sandboxes";
import { eq, and, desc, sql, inArray, notInArray } from "drizzle-orm";

export type {
  MilaidySandbox, NewMilaidySandbox,
  MilaidySandboxBackup, NewMilaidySandboxBackup,
  MilaidySandboxStatus, MilaidyBackupSnapshotType,
};

export class MilaidySandboxesRepository {
  // Reads

  async findById(id: string): Promise<MilaidySandbox | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxes).where(eq(milaidySandboxes.id, id)).limit(1);
    return r;
  }

  async findByIdAndOrg(id: string, orgId: string): Promise<MilaidySandbox | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxes)
      .where(and(eq(milaidySandboxes.id, id), eq(milaidySandboxes.organization_id, orgId))).limit(1);
    return r;
  }

  async listByOrganization(orgId: string): Promise<MilaidySandbox[]> {
    return dbRead.select().from(milaidySandboxes)
      .where(eq(milaidySandboxes.organization_id, orgId)).orderBy(desc(milaidySandboxes.created_at));
  }

  async findBySandboxId(sandboxId: string): Promise<MilaidySandbox | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxes)
      .where(eq(milaidySandboxes.sandbox_id, sandboxId)).limit(1);
    return r;
  }

  /** List active (non-terminal) sandboxes on a specific docker node. */
  async listByNodeId(nodeId: string): Promise<MilaidySandbox[]> {
    const terminalStatuses: MilaidySandboxStatus[] = ["stopped", "error"];
    return dbRead.select().from(milaidySandboxes)
      .where(and(
        eq(milaidySandboxes.node_id, nodeId),
        notInArray(milaidySandboxes.status, terminalStatuses),
      ));
  }

  async findRunningSandbox(id: string, orgId: string): Promise<MilaidySandbox | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxes)
      .where(and(eq(milaidySandboxes.id, id), eq(milaidySandboxes.organization_id, orgId), eq(milaidySandboxes.status, "running")))
      .limit(1);
    return r;
  }

  // Writes

  async create(data: NewMilaidySandbox): Promise<MilaidySandbox> {
    const [r] = await dbWrite.insert(milaidySandboxes).values(data).returning();
    if (!r) throw new Error("Failed to create Milaidy sandbox record");
    return r;
  }

  async update(id: string, data: Partial<NewMilaidySandbox>): Promise<MilaidySandbox | undefined> {
    const [r] = await dbWrite.update(milaidySandboxes).set({ ...data, updated_at: new Date() })
      .where(eq(milaidySandboxes.id, id)).returning();
    return r;
  }

  /** Atomically set provisioning — only from pending/stopped/disconnected/error. */
  async trySetProvisioning(id: string): Promise<MilaidySandbox | undefined> {
    const [r] = await dbWrite.update(milaidySandboxes)
      .set({ status: "provisioning", updated_at: new Date(), error_message: null })
      .where(and(eq(milaidySandboxes.id, id), sql`${milaidySandboxes.status} IN ('pending', 'stopped', 'disconnected', 'error')`))
      .returning();
    return r;
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    const r = await dbWrite.delete(milaidySandboxes)
      .where(and(eq(milaidySandboxes.id, id), eq(milaidySandboxes.organization_id, orgId)))
      .returning({ id: milaidySandboxes.id });
    return r.length > 0;
  }

  // Backups

  async createBackup(data: NewMilaidySandboxBackup): Promise<MilaidySandboxBackup> {
    const [r] = await dbWrite.insert(milaidySandboxBackups).values(data).returning();
    if (!r) throw new Error("Failed to create backup");
    return r;
  }

  async listBackups(sandboxRecordId: string, limit = 10): Promise<MilaidySandboxBackup[]> {
    return dbRead.select().from(milaidySandboxBackups)
      .where(eq(milaidySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(milaidySandboxBackups.created_at)).limit(limit);
  }

  async getLatestBackup(sandboxRecordId: string): Promise<MilaidySandboxBackup | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxBackups)
      .where(eq(milaidySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(milaidySandboxBackups.created_at)).limit(1);
    return r;
  }

  async getBackupById(backupId: string): Promise<MilaidySandboxBackup | undefined> {
    const [r] = await dbRead.select().from(milaidySandboxBackups).where(eq(milaidySandboxBackups.id, backupId)).limit(1);
    return r;
  }

  async pruneBackups(sandboxRecordId: string, keep: number): Promise<number> {
    const all = await dbRead.select({ id: milaidySandboxBackups.id }).from(milaidySandboxBackups)
      .where(eq(milaidySandboxBackups.sandbox_record_id, sandboxRecordId))
      .orderBy(desc(milaidySandboxBackups.created_at));
    if (all.length <= keep) return 0;
    const ids = all.slice(keep).map((b) => b.id);
    const r = await dbWrite.delete(milaidySandboxBackups).where(inArray(milaidySandboxBackups.id, ids)).returning({ id: milaidySandboxBackups.id });
    return r.length;
  }
}

export const milaidySandboxesRepository = new MilaidySandboxesRepository();
