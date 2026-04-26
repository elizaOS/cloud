# @elizaos/cloud-sdk

TypeScript SDK for Eliza Cloud API access, CLI login, API-key auth, agent management, model APIs, containers, billing credits, and generic endpoint calls.

```ts
import { ElizaCloudClient } from "@elizaos/cloud-sdk";

const cloud = new ElizaCloudClient({
  apiKey: process.env.ELIZAOS_CLOUD_API_KEY,
});

const models = await cloud.listModels();
const credits = await cloud.getCreditsBalance();
const agents = await cloud.listMiladyAgents();
```

Run live e2e tests against the real API with:

```bash
ELIZA_CLOUD_SDK_LIVE=1 ELIZAOS_CLOUD_API_KEY=eliza_... bun run test:e2e
```
