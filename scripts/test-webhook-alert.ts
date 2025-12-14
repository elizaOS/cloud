#!/usr/bin/env bun
// Sends a test alert to configured Discord/Slack webhooks

const discordUrl = process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
const slackUrl = process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;

if (!discordUrl && !slackUrl) {
  console.error("No webhook URLs configured. Set DB_SLOW_QUERY_DISCORD_WEBHOOK or DB_SLOW_QUERY_SLACK_WEBHOOK");
  process.exit(1);
}

const testPayload = {
  query: "SELECT * FROM test_table WHERE id = 123 -- TEST ALERT",
  durationMs: 500,
  severity: "warning" as const,
  timestamp: new Date(),
};

async function sendDiscord(): Promise<boolean> {
  if (!discordUrl) return false;
  const res = await fetch(discordUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "🧪 TEST: Slow Query Alert",
        color: 0x00ff00,
        fields: [
          { name: "Duration", value: `${testPayload.durationMs}ms`, inline: true },
          { name: "Status", value: "✅ Webhook working!", inline: true },
          { name: "Query", value: `\`\`\`sql\n${testPayload.query}\n\`\`\`` },
        ],
        timestamp: testPayload.timestamp.toISOString(),
      }],
    }),
  });
  console.log(`Discord: ${res.ok ? "✅" : "❌"} ${res.status}`);
  return res.ok;
}

async function sendSlack(): Promise<boolean> {
  if (!slackUrl) return false;
  const res = await fetch(slackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        { type: "header", text: { type: "plain_text", text: "🧪 TEST: Slow Query Alert" } },
        { type: "section", fields: [
          { type: "mrkdwn", text: `*Duration:*\n${testPayload.durationMs}ms` },
          { type: "mrkdwn", text: "*Status:*\n✅ Webhook working!" },
        ]},
        { type: "section", text: { type: "mrkdwn", text: `*Query:*\n\`\`\`${testPayload.query}\`\`\`` } },
      ],
    }),
  });
  console.log(`Slack: ${res.ok ? "✅" : "❌"} ${res.status}`);
  return res.ok;
}

const results = await Promise.all([sendDiscord(), sendSlack()].filter(Boolean));
process.exit(results.every(Boolean) ? 0 : 1);
