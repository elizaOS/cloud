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

    await expect(repository.getWhatsAppColumnSupport(fakeDatabase, "read")).rejects.toThrow(
      "transient schema probe failure",
    );

    const support = await repository.getWhatsAppColumnSupport(fakeDatabase, "read");

    expect(support).toEqual({
      users: true,
      userIdentities: true,
    });
    expect(executeCalls).toBe(2);
  });

  test("uses the compatibility projection for organization lookups when users.whatsapp columns are absent", async () => {
    const repository = new UsersRepository() as any;
    const selectedKeys: string[][] = [];
    let organizationLookupArgs: unknown;

    const fakeDatabase = {
      execute: async () => ({
        rows: [
          { table_name: "user_identities", column_name: "whatsapp_id" },
          { table_name: "user_identities", column_name: "whatsapp_name" },
        ],
      }),
      select: (selection: Record<string, unknown>) => {
        selectedKeys.push(Object.keys(selection));
        return {
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: "user-1",
                  email: "lifeops@example.com",
                  organization_id: "org-1",
                },
              ],
            }),
          }),
        };
      },
      query: {
        users: {
          findFirst: async (args: unknown) => {
            organizationLookupArgs = args;
            return {
              organization: {
                id: "org-1",
                name: "LifeOps",
              },
            };
          },
        },
      },
    };

    const user = await repository.findCompatibleUserWithOrganizationById(
      fakeDatabase,
      "read",
      "user-1",
    );

    expect(selectedKeys[0]).not.toContain("whatsapp_id");
    expect(selectedKeys[0]).not.toContain("whatsapp_name");
    expect(user).toMatchObject({
      id: "user-1",
      organization: { id: "org-1", name: "LifeOps" },
      whatsapp_id: null,
      whatsapp_name: null,
    });
    expect(organizationLookupArgs).toMatchObject({
      columns: { id: true },
      with: { organization: true },
    });
  });
});
