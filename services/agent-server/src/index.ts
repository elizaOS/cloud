import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createRoutes } from "./routes";
import { AgentManager } from "./agent-manager";
import { getRedis } from "./redis";

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
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT ?? 3000);
const manager = new AgentManager();

new Elysia().use(cors()).use(createRoutes(manager)).listen(PORT);

manager.initialize().then(async () => {
  if (process.env.TIER === "shared") {
    await manager.startAgent("eliza", "Eliza");
    console.log("Auto-started shared Eliza agent (shared tier)");
  } else if (process.env.AGENT_ID) {
    await manager.startAgent(
      process.env.AGENT_ID,
      process.env.CHARACTER_REF || process.env.AGENT_ID,
    );
    console.log(`Auto-started agent ${process.env.AGENT_ID} (dedicated tier)`);
  }
  console.log(
    `agent-server ${process.env.SERVER_NAME} listening on :${PORT} (tier=${process.env.TIER}, capacity=${process.env.CAPACITY})`,
  );
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, draining...");
  await manager.drain();
  const redis = getRedis();
  await redis.del(`server:${process.env.SERVER_NAME}:status`);
  redis.disconnect();
  process.exit(0);
});
