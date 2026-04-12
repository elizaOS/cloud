import "../load-env";
import { ensureLocalTestAuth } from "../infrastructure/local-test-auth";

export default async function globalSetup(): Promise<void> {
  await ensureLocalTestAuth();
}
