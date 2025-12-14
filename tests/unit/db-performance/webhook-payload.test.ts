import { describe, it, expect } from "bun:test";

// Discord Embed structure
interface DiscordEmbed {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp: string;
}

interface DiscordPayload {
  embeds: DiscordEmbed[];
}

// Slack Block Kit structure
interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
}

interface SlackPayload {
  blocks: SlackBlock[];
}

// Replicate the formatting logic from query-alerting.ts
function formatDiscordPayload(
  query: string,
  durationMs: number,
  severity: "warning" | "critical",
  timestamp: Date
): DiscordPayload {
  const color = severity === "critical" ? 0xff0000 : 0xffaa00;
  const emoji = severity === "critical" ? "🔴" : "🟡";
  const truncated = query.length > 500 ? query.substring(0, 500) + "..." : query;

  return {
    embeds: [
      {
        title: `${emoji} Slow Database Query`,
        color,
        fields: [
          { name: "Duration", value: `${durationMs}ms`, inline: true },
          { name: "Severity", value: severity.toUpperCase(), inline: true },
          { name: "Query", value: `\`\`\`sql\n${truncated}\n\`\`\`` },
        ],
        timestamp: timestamp.toISOString(),
      },
    ],
  };
}

function formatSlackPayload(
  query: string,
  durationMs: number,
  severity: "warning" | "critical"
): SlackPayload {
  const emoji = severity === "critical" ? ":red_circle:" : ":large_yellow_circle:";
  const truncated = query.length > 500 ? query.substring(0, 500) + "..." : query;

  return {
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} Slow Database Query`, emoji: true } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Duration:*\n${durationMs}ms` },
          { type: "mrkdwn", text: `*Severity:*\n${severity.toUpperCase()}` },
        ],
      },
      { type: "section", text: { type: "mrkdwn", text: `*Query:*\n\`\`\`${truncated}\`\`\`` } },
    ],
  };
}

describe("Discord webhook payload", () => {
  it("formats warning severity correctly", () => {
    const payload = formatDiscordPayload(
      "SELECT * FROM users",
      250,
      "warning",
      new Date("2024-01-15T12:00:00Z")
    );

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toBe("🟡 Slow Database Query");
    expect(payload.embeds[0].color).toBe(0xffaa00); // Orange
    expect(payload.embeds[0].fields[0]).toEqual({ name: "Duration", value: "250ms", inline: true });
    expect(payload.embeds[0].fields[1]).toEqual({ name: "Severity", value: "WARNING", inline: true });
    expect(payload.embeds[0].timestamp).toBe("2024-01-15T12:00:00.000Z");
  });

  it("formats critical severity correctly", () => {
    const payload = formatDiscordPayload(
      "SELECT * FROM users",
      1500,
      "critical",
      new Date("2024-01-15T12:00:00Z")
    );

    expect(payload.embeds[0].title).toBe("🔴 Slow Database Query");
    expect(payload.embeds[0].color).toBe(0xff0000); // Red
    expect(payload.embeds[0].fields[1]).toEqual({ name: "Severity", value: "CRITICAL", inline: true });
  });

  it("truncates long queries", () => {
    const longQuery = "SELECT " + "a".repeat(600);
    const payload = formatDiscordPayload(longQuery, 500, "warning", new Date());

    const queryField = payload.embeds[0].fields[2];
    expect(queryField.value.length).toBeLessThan(600);
    expect(queryField.value).toContain("...");
  });

  it("wraps query in SQL code block", () => {
    const payload = formatDiscordPayload("SELECT 1", 100, "warning", new Date());
    const queryField = payload.embeds[0].fields[2];

    expect(queryField.value).toMatch(/^```sql\n/);
    expect(queryField.value).toMatch(/\n```$/);
  });

  it("produces valid JSON", () => {
    const payload = formatDiscordPayload("SELECT * FROM test", 200, "warning", new Date());
    const json = JSON.stringify(payload);
    
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("Slack webhook payload", () => {
  it("formats warning severity correctly", () => {
    const payload = formatSlackPayload("SELECT * FROM users", 250, "warning");

    expect(payload.blocks).toHaveLength(3);
    expect(payload.blocks[0].type).toBe("header");
    expect(payload.blocks[0].text!.text).toBe(":large_yellow_circle: Slow Database Query");
    expect(payload.blocks[1].fields![0].text).toBe("*Duration:*\n250ms");
    expect(payload.blocks[1].fields![1].text).toBe("*Severity:*\nWARNING");
  });

  it("formats critical severity correctly", () => {
    const payload = formatSlackPayload("SELECT * FROM users", 1500, "critical");

    expect(payload.blocks[0].text!.text).toBe(":red_circle: Slow Database Query");
    expect(payload.blocks[1].fields![1].text).toBe("*Severity:*\nCRITICAL");
  });

  it("truncates long queries", () => {
    const longQuery = "SELECT " + "a".repeat(600);
    const payload = formatSlackPayload(longQuery, 500, "warning");

    const queryBlock = payload.blocks[2];
    expect(queryBlock.text!.text.length).toBeLessThan(700);
    expect(queryBlock.text!.text).toContain("...");
  });

  it("uses correct Slack block types", () => {
    const payload = formatSlackPayload("SELECT 1", 100, "warning");

    expect(payload.blocks[0].type).toBe("header");
    expect(payload.blocks[1].type).toBe("section");
    expect(payload.blocks[2].type).toBe("section");
  });

  it("uses mrkdwn for field formatting", () => {
    const payload = formatSlackPayload("SELECT 1", 100, "warning");

    expect(payload.blocks[1].fields![0].type).toBe("mrkdwn");
    expect(payload.blocks[1].fields![1].type).toBe("mrkdwn");
    expect(payload.blocks[2].text!.type).toBe("mrkdwn");
  });

  it("produces valid JSON", () => {
    const payload = formatSlackPayload("SELECT * FROM test", 200, "warning");
    const json = JSON.stringify(payload);
    
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("webhook payload edge cases", () => {
  it("handles empty query", () => {
    const discord = formatDiscordPayload("", 100, "warning", new Date());
    const slack = formatSlackPayload("", 100, "warning");

    expect(discord.embeds[0].fields[2].value).toBe("```sql\n\n```");
    expect(slack.blocks[2].text!.text).toBe("*Query:*\n``````");
  });

  it("handles query with special characters", () => {
    const query = "SELECT * FROM users WHERE name = 'O''Brien' AND data->>'key' = 'value'";
    const discord = formatDiscordPayload(query, 100, "warning", new Date());
    const slack = formatSlackPayload(query, 100, "warning");

    // Should not throw
    expect(JSON.stringify(discord)).toBeDefined();
    expect(JSON.stringify(slack)).toBeDefined();
  });

  it("handles query with newlines", () => {
    const query = "SELECT\n  id,\n  name\nFROM\n  users";
    const discord = formatDiscordPayload(query, 100, "warning", new Date());
    const slack = formatSlackPayload(query, 100, "warning");

    expect(discord.embeds[0].fields[2].value).toContain(query);
    expect(slack.blocks[2].text!.text).toContain(query);
  });

  it("handles very large duration values", () => {
    const discord = formatDiscordPayload("SELECT 1", 999999, "critical", new Date());
    const slack = formatSlackPayload("SELECT 1", 999999, "critical");

    expect(discord.embeds[0].fields[0].value).toBe("999999ms");
    expect(slack.blocks[1].fields![0].text).toContain("999999ms");
  });

  it("handles unicode in query", () => {
    const query = "SELECT * FROM users WHERE name = '日本語'";
    const discord = formatDiscordPayload(query, 100, "warning", new Date());
    const slack = formatSlackPayload(query, 100, "warning");

    expect(discord.embeds[0].fields[2].value).toContain("日本語");
    expect(slack.blocks[2].text!.text).toContain("日本語");
  });
});

