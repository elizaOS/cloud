import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { dbRead, dbWrite } from "@/db/helpers";
import {
  type MiladyPairingToken,
  miladyPairingTokens,
  type NewMiladyPairingToken,
} from "@/db/schemas/milady-pairing-tokens";

export type { MiladyPairingToken, NewMiladyPairingToken };

export class MiladyPairingTokensRepository {
  async create(data: NewMiladyPairingToken): Promise<MiladyPairingToken> {
    const [row] = await dbWrite.insert(miladyPairingTokens).values(data).returning();

    if (!row) {
      throw new Error("Failed to create pairing token");
    }

    return row;
  }

  async consumeValidToken(
    tokenHash: string,
    expectedOrigin: string,
  ): Promise<MiladyPairingToken | undefined> {
    const now = new Date();

    const [row] = await dbWrite
      .update(miladyPairingTokens)
      .set({ used_at: now })
      .where(
        and(
          eq(miladyPairingTokens.token_hash, tokenHash),
          eq(miladyPairingTokens.expected_origin, expectedOrigin),
          isNull(miladyPairingTokens.used_at),
          gt(miladyPairingTokens.expires_at, now),
        ),
      )
      .returning();

    return row;
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    const deleted = await dbWrite
      .delete(miladyPairingTokens)
      .where(and(lt(miladyPairingTokens.expires_at, now), isNull(miladyPairingTokens.used_at)))
      .returning({ id: miladyPairingTokens.id });

    return deleted.length;
  }

  async findByTokenHash(tokenHash: string): Promise<MiladyPairingToken | undefined> {
    const [row] = await dbRead
      .select()
      .from(miladyPairingTokens)
      .where(eq(miladyPairingTokens.token_hash, tokenHash))
      .limit(1);

    return row;
  }
}

export const miladyPairingTokensRepository = new MiladyPairingTokensRepository();
