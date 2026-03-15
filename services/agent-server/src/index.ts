import { Elysia } from "elysia";
import { AgentManager } from "./agent-manager";
import { getRedis } from "./redis";
import { createRoutes } from "./routes";

// Map DATABASE_URL → POSTGRES_URL for @elizaos/plugin-sql
if (process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

const required = [
  "SERVER_NAME",
  "REDIS_URL",
  "DATABASE_URL",
  "CAPACITY",
  "TIER",
  "AGENT_SERVER_SHARED_SECRET",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

if (process.env.AGENT_ID && !process.env.CHARACTER_REF) {
  console.error("CHARACTER_REF is required when AGENT_ID is set");
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3000);
const manager = new AgentManager();

// Initialize manager before accepting connections
await manager.initialize();

const agentId = process.env.AGENT_ID;
const characterRef = process.env.CHARACTER_REF;
if (agentId && characterRef) {
  await manager.startAgent(agentId, characterRef);
  console.log(
    `Auto-started agent ${agentId} (${process.env.TIER} tier, character=${characterRef})`,
  );
}

new Elysia().use(createRoutes(manager, process.env.AGENT_SERVER_SHARED_SECRET!)).listen(PORT);

console.log(
  `agent-server ${process.env.SERVER_NAME} listening on :${PORT} (tier=${process.env.TIER}, capacity=${process.env.CAPACITY})`,
);

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, draining...");
  await manager.drain();
  await manager.cleanupRedis();
  const redis = getRedis();
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
  process.exit(0);
});
