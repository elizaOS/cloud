import { usersService } from "./lib/services/users";
import { usersRepository } from "./db/repositories";
import { getConnectionString } from "./tests/helpers/local-database";
import { createTestDataSet, cleanupTestData } from "./tests/helpers/test-data-factory";
import { v4 as uuidv4 } from "uuid";

(async () => {
  const connectionString = getConnectionString();
  const testData = await createTestDataSet(connectionString, { creditBalance: 100 });
  const privyId = `did:privy:${uuidv4()}`;
  
  console.log("-> Updating privy_user_id");
  await usersService.update(testData.user.id, { privy_user_id: privyId });
  
  console.log("-> Calling cache.get directly");
  const { cache } = await import("./lib/cache/client");
  const { CacheKeys } = await import("./lib/cache/keys");
  const cacheKey = CacheKeys.user.byPrivyId(privyId);
  console.log("cacheKey:", cacheKey);
  
  const fromCache = await cache.get(cacheKey);
  console.log("fromCache:", fromCache);
  
  console.log("-> Calling repository directly");
  const fromRepo = await usersRepository.findByPrivyIdWithOrganization(privyId);
  console.log("fromRepo:", fromRepo);

  console.log("-> Calling usersService.getByPrivyId");
  const fromService = await usersService.getByPrivyId(privyId);
  console.log("fromService:", fromService);

  await cleanupTestData(connectionString, testData.organization.id);
  process.exit(0);
})();
