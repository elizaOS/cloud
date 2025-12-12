/**
 * Manual Provider Test Script
 *
 * Tests the /api/v1/secrets/test endpoint with REAL API keys.
 *
 * Usage:
 *   TEST_OPENAI_KEY=sk-xxx bun run tests/manual/secrets-provider-test.ts
 *
 * Requires:
 * - Running server at TEST_API_URL (default: http://localhost:3000)
 * - Valid API key for TEST_API_KEY
 * - Provider-specific keys (TEST_OPENAI_KEY, TEST_ANTHROPIC_KEY, etc.)
 */

const API_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

if (!API_KEY) {
  console.error("❌ TEST_API_KEY is required");
  process.exit(1);
}

async function testProvider(provider: string, key: string | undefined, label: string) {
  if (!key) {
    console.log(`⏭️  Skipping ${label} (no key provided)`);
    return;
  }

  console.log(`Testing ${label}...`);

  const response = await fetch(`${API_URL}/api/v1/secrets/test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider, value: key }),
  });

  const data = await response.json();

  if (data.valid) {
    console.log(`✅ ${label}: Valid`);
    if (data.metadata) {
      console.log(`   Metadata: ${JSON.stringify(data.metadata)}`);
    }
  } else {
    console.log(`❌ ${label}: Invalid - ${data.message}`);
  }
}

async function main() {
  console.log(`\n🔑 Provider API Key Testing\n`);
  console.log(`API URL: ${API_URL}`);
  console.log(`---\n`);

  await testProvider("openai", process.env.TEST_OPENAI_KEY, "OpenAI");
  await testProvider("anthropic", process.env.TEST_ANTHROPIC_KEY, "Anthropic");
  await testProvider("google", process.env.TEST_GOOGLE_KEY, "Google AI");
  await testProvider("elevenlabs", process.env.TEST_ELEVENLABS_KEY, "ElevenLabs");
  await testProvider("stripe", process.env.TEST_STRIPE_KEY, "Stripe");
  await testProvider("discord", process.env.TEST_DISCORD_TOKEN, "Discord Bot");
  await testProvider("telegram", process.env.TEST_TELEGRAM_TOKEN, "Telegram Bot");
  await testProvider("github", process.env.TEST_GITHUB_TOKEN, "GitHub");

  console.log(`\n---\nDone\n`);
}

main().catch(console.error);

