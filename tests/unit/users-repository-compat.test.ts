import { afterEach, describe, expect, test } from "bun:test";
import { UsersRepository } from "@/db/repositories/users";

describe("UsersRepository WhatsApp schema compatibility cache", () => {
  afterEach(() => {
    UsersRepository.resetWhatsAppColumnSupportCacheForTests();
  });

  test("clears cached probe failures so the next lookup can retry", async () => {
    const repository = new UsersRepository() as any;
    let executeCalls = 0;

    const fakeDatabase = {
      execute: async () => {
        executeCalls += 1;

        if (executeCalls === 1) {
          throw new Error("transient schema probe failure");
        }

        return {
          rows: [
            { table_name: "users", column_name: "whatsapp_id" },
            { table_name: "users", column_name: "whatsapp_name" },
            { table_name: "user_identities", column_name: "whatsapp_id" },
            { table_name: "user_identities", column_name: "whatsapp_name" },
          ],
        };
      },
    };

    await expect(
      repository.getWhatsAppColumnSupport(fakeDatabase, "read"),
    ).rejects.toThrow("transient schema probe failure");

    const support = await repository.getWhatsAppColumnSupport(
      fakeDatabase,
      "read",
    );

    expect(support).toEqual({
      users: true,
      userIdentities: true,
    });
    expect(executeCalls).toBe(2);
  });
});
