import "../load-env";
import { ensureLocalTestAuth } from "../infrastructure/local-test-auth";

const DEFAULT_TEST_SECRETS_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const OPTIONAL_OAUTH_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LINEAR_CLIENT_ID",
  "LINEAR_CLIENT_SECRET",
  "NOTION_CLIENT_ID",
  "NOTION_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
] as const;

// Keep DB-backed integration/e2e suites deterministic on developer machines even
// when local .env files contain optional OAuth provider credentials.
if (!process.env.SECRETS_MASTER_KEY) {
  process.env.SECRETS_MASTER_KEY = DEFAULT_TEST_SECRETS_MASTER_KEY;
}

if (process.env.PRESERVE_LOCAL_OAUTH_PROVIDER_ENV !== "1") {
  for (const envVar of OPTIONAL_OAUTH_ENV_VARS) {
    process.env[envVar] = "";
  }
}

await ensureLocalTestAuth();
await import("./setup-server");
