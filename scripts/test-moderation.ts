#!/usr/bin/env bun
/**
 * CLI tool for testing the moderation system
 *
 * Usage:
 *   bun run scripts/test-moderation.ts --text "content to test"
 *   bun run scripts/test-moderation.ts --image-url "https://example.com/image.jpg"
 *   bun run scripts/test-moderation.ts --file /path/to/image.jpg
 */

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY not set");
  process.exit(1);
}

const THRESHOLDS: Record<
  string,
  { threshold: number; severity: string; emoji: string }
> = {
  "sexual/minors": { threshold: 0.1, severity: "critical", emoji: "🚨" },
  "self-harm/instructions": { threshold: 0.3, severity: "high", emoji: "⚠️" },
  "self-harm/intent": { threshold: 0.4, severity: "high", emoji: "⚠️" },
  "self-harm": { threshold: 0.5, severity: "medium", emoji: "⚡" },
  "violence/graphic": { threshold: 0.7, severity: "medium", emoji: "⚡" },
  "illicit/violent": { threshold: 0.5, severity: "high", emoji: "⚠️" },
};

async function testModeration(
  input: string | { type: "image_url"; image_url: { url: string } }[],
) {
  console.log("\n🔍 Testing moderation...\n");
  const startTime = Date.now();

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input,
    }),
  });

  const latency = Date.now() - startTime;

  if (!res.ok) {
    console.error(`❌ API error: ${res.status} ${res.statusText}`);
    const error = await res.text();
    console.error(error);
    process.exit(1);
  }

  const data = await res.json();
  const result = data.results?.[0];

  if (!result) {
    console.error("❌ No results returned");
    process.exit(1);
  }

  console.log(`⏱️  Latency: ${latency}ms`);
  console.log(`📊 Model: omni-moderation-latest\n`);

  // Check each category
  const flagged: string[] = [];

  console.log("Category Scores:");
  console.log("─".repeat(60));

  for (const [category, config] of Object.entries(THRESHOLDS)) {
    const score = result.category_scores[category] ?? 0;
    const isFlagged = score >= config.threshold;
    const bar =
      "█".repeat(Math.floor(score * 30)) +
      "░".repeat(30 - Math.floor(score * 30));
    const status = isFlagged
      ? `${config.emoji} FLAGGED (${config.severity.toUpperCase()})`
      : "✅ OK";

    console.log(
      `${category.padEnd(25)} [${bar}] ${(score * 100).toFixed(1).padStart(5)}% ${status}`,
    );

    if (isFlagged) {
      flagged.push(category);
    }
  }

  console.log("─".repeat(60));
  console.log();

  if (flagged.length > 0) {
    console.log(`🚫 FLAGGED CATEGORIES: ${flagged.join(", ")}`);
    console.log();

    // Determine action
    const hasCritical = flagged.some(
      (c) => THRESHOLDS[c]?.severity === "critical",
    );
    const hasHigh = flagged.some((c) => THRESHOLDS[c]?.severity === "high");

    if (hasCritical) {
      console.log("🚨 Action: CONTENT DELETED + USER STRIKE (CRITICAL)");
    } else if (hasHigh) {
      console.log("⚠️  Action: CONTENT DELETED + USER STRIKE (HIGH)");
    } else {
      console.log("⚡ Action: WARNING + USER STRIKE (MEDIUM)");
    }
  } else {
    console.log("✅ CLEAN - No policy violations detected");
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Moderation Test CLI

Usage:
  bun run scripts/test-moderation.ts --text "content to test"
  bun run scripts/test-moderation.ts --image-url "https://example.com/image.jpg"
  bun run scripts/test-moderation.ts --file /path/to/image.jpg

Options:
  --text TEXT        Test text content
  --image-url URL    Test image by URL
  --file PATH        Test local image file (will be base64 encoded)
  --help             Show this help

Examples:
  # Test safe text
  bun run scripts/test-moderation.ts --text "Hello, how are you today?"

  # Test safe public image
  bun run scripts/test-moderation.ts --image-url "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/220px-Camponotus_flavomarginatus_ant.jpg"
`);
    process.exit(0);
  }

  const textIdx = args.indexOf("--text");
  const imageUrlIdx = args.indexOf("--image-url");
  const fileIdx = args.indexOf("--file");

  if (textIdx !== -1 && args[textIdx + 1]) {
    await testModeration(args[textIdx + 1]);
  } else if (imageUrlIdx !== -1 && args[imageUrlIdx + 1]) {
    const url = args[imageUrlIdx + 1];
    console.log(`📷 Testing image URL: ${url}`);
    await testModeration([{ type: "image_url", image_url: { url } }]);
  } else if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = args[fileIdx + 1];
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    console.log(`📷 Testing local file: ${filePath}`);
    console.log(`   Size: ${(buffer.byteLength / 1024).toFixed(1)}KB`);
    console.log(`   Type: ${mimeType}`);

    await testModeration([
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      },
    ]);
  } else {
    console.error("❌ No input provided. Use --help for usage.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
