/**
 * Seed script for Todo App development environment
 *
 * Creates:
 * - Test organization
 * - Test user
 * - Todo app registration
 * - API key for app
 * - Todo assistant agent/character
 * - Storage collections (tasks, user_points)
 *
 * Usage: bun run db:todoapp:seed
 */

import { db } from "@/db";
import { organizations } from "@/db/schemas/organizations";
import { users, userOrganizations } from "@/db/schemas/users";
import { apps, type NewApp } from "@/db/schemas/apps";
import { apiKeys, type NewApiKey } from "@/db/schemas/api-keys";
import { userCharacters, type NewUserCharacter } from "@/db/schemas/user-characters";
import { appCollections, type CollectionSchema, type CollectionIndex } from "@/db/schemas/app-storage";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

const TODO_APP_NAME = "Eliza Todo";
const TODO_APP_SLUG = "eliza-todo";
const TODO_AGENT_NAME = "Task Assistant";

async function seedTodoAppDev() {
  logger.info("[Seed Todo App] Starting seed process...");

  // ============================================
  // 1. Create or get test organization
  // ============================================
  let org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, "todoapp-dev"),
  });

  if (!org) {
    logger.info("[Seed Todo App] Creating test organization...");
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: "Todo App Dev",
        slug: "todoapp-dev",
        credit_balance: "100.0000", // $100 test credits
      })
      .returning();
    org = newOrg;
    logger.info(`[Seed Todo App] Created organization: ${org?.id}`);
  } else {
    logger.info(`[Seed Todo App] Using existing organization: ${org.id}`);
  }

  if (!org) {
    throw new Error("Failed to create or find organization");
  }

  // ============================================
  // 2. Create or get test user
  // ============================================
  let user = await db.query.users.findFirst({
    where: eq(users.email, "todoapp-dev@eliza.ai"),
  });

  if (!user) {
    logger.info("[Seed Todo App] Creating test user...");
    const [newUser] = await db
      .insert(users)
      .values({
        email: "todoapp-dev@eliza.ai",
        name: "Todo App Developer",
        nickname: "tododev",
        privy_did: `did:privy:todoapp-dev-${Date.now()}`,
      })
      .returning();
    user = newUser;

    // Link user to org
    if (user) {
      await db.insert(userOrganizations).values({
        user_id: user.id,
        organization_id: org.id,
        role: "owner",
      });
    }
    logger.info(`[Seed Todo App] Created user: ${user?.id}`);
  } else {
    logger.info(`[Seed Todo App] Using existing user: ${user.id}`);
  }

  if (!user) {
    throw new Error("Failed to create or find user");
  }

  // ============================================
  // 3. Create or get todo app registration
  // ============================================
  let app = await db.query.apps.findFirst({
    where: eq(apps.slug, TODO_APP_SLUG),
  });

  if (!app) {
    logger.info("[Seed Todo App] Creating todo app registration...");
    const appData: NewApp = {
      organization_id: org.id,
      name: TODO_APP_NAME,
      slug: TODO_APP_SLUG,
      description: "Intelligent task management powered by AI",
      app_type: "app",
      is_public: false,
      enabled: true,
    };
    const [newApp] = await db.insert(apps).values(appData).returning();
    app = newApp;
    logger.info(`[Seed Todo App] Created app: ${app?.id}`);
  } else {
    logger.info(`[Seed Todo App] Using existing app: ${app.id}`);
  }

  if (!app) {
    throw new Error("Failed to create or find app");
  }

  // ============================================
  // 4. Create or get API key
  // ============================================
  let apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.app_id, app.id),
  });

  let rawKey: string | undefined;

  if (!apiKey) {
    logger.info("[Seed Todo App] Creating API key...");
    rawKey = `eliza_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const keyData: NewApiKey = {
      organization_id: org.id,
      name: `${TODO_APP_NAME} Development Key`,
      key_hash: keyHash,
      last_four: rawKey.slice(-4),
      app_id: app.id,
      scope: "app",
    };

    const [newKey] = await db.insert(apiKeys).values(keyData).returning();
    apiKey = newKey;
    logger.info(`[Seed Todo App] Created API key: ${apiKey?.id}`);
  } else {
    logger.info(`[Seed Todo App] Using existing API key: ${apiKey.id}`);
    logger.info("[Seed Todo App] Note: Cannot retrieve existing key value. Delete and re-run if needed.");
  }

  // ============================================
  // 5. Create or get todo agent/character
  // ============================================
  let agent = await db.query.userCharacters.findFirst({
    where: eq(userCharacters.name, TODO_AGENT_NAME),
  });

  if (!agent) {
    logger.info("[Seed Todo App] Creating todo agent character...");

    const characterData: NewUserCharacter = {
      organization_id: org.id,
      user_id: user.id,
      name: TODO_AGENT_NAME,
      username: "task-assistant",
      system: `You are a friendly and motivating task management assistant. Your role is to help users:

1. Create and organize tasks (daily habits, one-off tasks, aspirational goals)
2. Stay motivated with gamification (points, streaks, levels)
3. Build productive habits
4. Prioritize work effectively

When users ask to create tasks, extract:
- Task name (required)
- Type: "daily" (recurring), "one-off" (single), or "aspirational" (long-term goals)
- Priority: 1 (highest) to 4 (lowest) for one-off tasks
- Urgency: whether it's time-sensitive
- Due date: if mentioned

Be encouraging and celebrate completions! Use the gamification system to motivate users.`,
      bio: [
        "I help you manage tasks, build habits, and stay productive.",
        "Let me help you organize your day and achieve your goals.",
      ],
      message_examples: [
        [
          { user: "user", content: { text: "Add a task to review the quarterly report by Friday" } },
          {
            user: "Task Assistant",
            content: {
              text: "I've created a one-off task: 'Review quarterly report' with a due date of Friday. I've set it as priority 2 since it has a deadline. Would you like me to mark it as urgent?",
            },
          },
        ],
        [
          { user: "user", content: { text: "I want to exercise every morning" } },
          {
            user: "Task Assistant",
            content: {
              text: "Great goal! I've added 'Morning exercise' as a daily habit. You'll earn 10 base points each day you complete it, plus bonus points for maintaining your streak. Your current streak will start at 0. Ready to build that habit? 💪",
            },
          },
        ],
        [
          { user: "user", content: { text: "What should I work on today?" } },
          {
            user: "Task Assistant",
            content: {
              text: "Let me check your tasks! You have 2 urgent items and 1 overdue task. I'd recommend starting with the overdue one to clear it, then tackling your urgent tasks. Would you like me to show you the full list?",
            },
          },
        ],
      ],
      topics: ["productivity", "task management", "habits", "goals", "time management"],
      adjectives: ["helpful", "encouraging", "organized", "motivating", "friendly"],
      style: {
        all: [
          "Be encouraging and positive",
          "Celebrate task completions",
          "Use gamification language (points, streaks, levels)",
          "Give actionable suggestions",
        ],
        chat: [
          "Be conversational and friendly",
          "Ask clarifying questions when needed",
          "Offer to help with next steps",
        ],
      },
      plugins: ["@elizaos/plugin-mcp"], // Enable MCP for tool calling
      settings: {
        model: "claude-sonnet-4-20250514",
        voice: { model: "en_US-hfc_female-medium" },
        // MCP server configuration - tools for task management
        mcp: {
          servers: {
            "todo-tasks": {
              type: "http",
              // Uses the cloud's todo MCP endpoint (requires auth)
              url: "/api/mcp/todoapp",
            },
          },
        },
      },
      character_data: {},
      source: "app", // Use app to work with existing API routes
      is_public: true, // Required for A2A and MCP access
      is_template: false,
      a2a_enabled: true,
      mcp_enabled: true,
    };

    const [newAgent] = await db.insert(userCharacters).values(characterData).returning();
    agent = newAgent;
    logger.info(`[Seed Todo App] Created agent: ${agent?.id}`);
  } else {
    logger.info(`[Seed Todo App] Using existing agent: ${agent.id}`);
  }

  // ============================================
  // 6. Create storage collections
  // ============================================
  const tasksCollection = await db.query.appCollections.findFirst({
    where: eq(appCollections.name, "tasks"),
  });

  if (!tasksCollection) {
    logger.info("[Seed Todo App] Creating tasks collection...");
    const tasksSchema: CollectionSchema = {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        type: { type: "string", description: "Task type: daily, one-off, aspirational" },
        priority: { type: "integer", description: "Priority 1-4" },
        urgent: { type: "boolean", description: "Is urgent" },
        completed: { type: "boolean", description: "Is completed" },
        recurring: { type: "string", description: "Recurring pattern" },
        metadata: { type: "object", description: "Task metadata" },
      },
      required: ["name", "type", "completed"],
    };

    const tasksIndexes: CollectionIndex[] = [
      { field: "type", type: "string" },
      { field: "completed", type: "boolean" },
    ];

    await db.insert(appCollections).values({
      app_id: app.id,
      name: "tasks",
      description: "Todo tasks storage",
      schema: tasksSchema,
      indexes: tasksIndexes,
    });
    logger.info("[Seed Todo App] Created tasks collection");
  }

  const pointsCollection = await db.query.appCollections.findFirst({
    where: eq(appCollections.name, "user_points"),
  });

  if (!pointsCollection) {
    logger.info("[Seed Todo App] Creating user_points collection...");
    const pointsSchema: CollectionSchema = {
      type: "object",
      properties: {
        currentPoints: { type: "integer", description: "Current points" },
        totalEarned: { type: "integer", description: "Total points earned" },
        streak: { type: "integer", description: "Current streak" },
        lastCompletionDate: { type: "string", description: "Last task completion date" },
        history: { type: "array", description: "Points history" },
      },
      required: ["currentPoints", "totalEarned"],
    };

    await db.insert(appCollections).values({
      app_id: app.id,
      name: "user_points",
      description: "User points and gamification data",
      schema: pointsSchema,
      indexes: [],
    });
    logger.info("[Seed Todo App] Created user_points collection");
  }

  // ============================================
  // 7. Write .env.local file
  // ============================================
  if (rawKey) {
    const envPath = path.join(process.cwd(), "todo-app", ".env.local");
    const envContent = `# Generated by seed-todoapp-dev.ts
# ${new Date().toISOString()}

# API Key for Eliza Cloud
ELIZA_CLOUD_API_KEY=${rawKey}

# Cloud API URL (defaults to localhost in dev)
NEXT_PUBLIC_CLOUD_URL=http://localhost:3000

# App URL (for callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3002
`;

    fs.writeFileSync(envPath, envContent);
    logger.info(`[Seed Todo App] Written ${envPath}`);
  }

  // ============================================
  // Summary
  // ============================================
  logger.info("\n" + "=".repeat(60));
  logger.info("[Seed Todo App] Setup Complete!");
  logger.info("=".repeat(60));
  logger.info(`Organization ID: ${org.id}`);
  logger.info(`User ID: ${user.id}`);
  logger.info(`App ID: ${app.id}`);
  logger.info(`Agent ID: ${agent?.id}`);
  logger.info(`API Key ID: ${apiKey?.id}`);
  if (rawKey) {
    logger.info(`\nAPI Key (save this!): ${rawKey}`);
    logger.info(`\nKey written to: todo-app/.env.local`);
  }
  logger.info("\nNext steps:");
  logger.info("  1. Start cloud: bun run dev");
  logger.info("  2. Start todo-app: cd todo-app && bun run dev");
  logger.info("  3. Open http://localhost:3002");
  logger.info("=".repeat(60) + "\n");
}

// Run the seed
seedTodoAppDev()
  .then(() => {
    logger.info("[Seed Todo App] Done!");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("[Seed Todo App] Error:", error);
    process.exit(1);
  });
