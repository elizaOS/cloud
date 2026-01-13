#!/usr/bin/env bun
/**
 * Connection Pool Test Script
 *
 * Quick API tests to verify database connection pooling fixes.
 * Can run against any environment (local, staging, prod).
 *
 * USAGE:
 *   # Local (default)
 *   bun run scripts/test-connection-pool.ts
 *
 *   # Against staging
 *   API_URL=https://staging.eliza.ai API_KEY=ek_xxx bun run scripts/test-connection-pool.ts
 *
 *   # Against production
 *   API_URL=https://eliza.ai API_KEY=ek_xxx bun run scripts/test-connection-pool.ts
 *
 * WHAT IT TESTS:
 *   1. Basic chat message (verifies DB connection works)
 *   2. Rapid sequential messages (stress test)
 *   3. Simulated character update flow (the critical fix)
 */

const API_URL = process.env.API_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("❌ API_KEY environment variable is required");
  console.log("\nUsage:");
  console.log("  API_KEY=ek_xxx bun run scripts/test-connection-pool.ts");
  console.log(
    "  API_URL=https://staging.eliza.ai API_KEY=ek_xxx bun run scripts/test-connection-pool.ts"
  );
  process.exit(1);
}

console.log("=".repeat(60));
console.log("🔧 CONNECTION POOL TEST SCRIPT");
console.log("=".repeat(60));
console.log(`   Target: ${API_URL}`);
console.log(`   API Key: ${API_KEY.substring(0, 10)}...`);
console.log("=".repeat(60));

interface ApiError {
  error: string;
  type?: string;
}

interface ChatResponse {
  message: {
    id: string;
    content: { text: string };
  };
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

async function createRoom(): Promise<string> {
  const response = await fetch(`${API_URL}/api/eliza/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      name: `Pool Test ${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(`Failed to create room: ${error.error}`);
  }

  const data = await response.json();
  return data.room.id;
}

async function sendMessage(
  roomId: string,
  text: string
): Promise<ChatResponse> {
  const response = await fetch(
    `${API_URL}/api/eliza/rooms/${roomId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      `Message failed: ${error.error} (${error.type || "unknown"})`
    );
  }

  return response.json();
}

async function sendStreamMessage(
  roomId: string,
  text: string
): Promise<string> {
  const response = await fetch(
    `${API_URL}/api/eliza/rooms/${roomId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(
      `Stream failed: ${error.error} (${error.type || "unknown"})`
    );
  }

  // Read SSE stream and extract response text
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.chunk) {
            fullText += data.chunk;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  return fullText;
}

function logResult(
  test: string,
  success: boolean,
  duration: number,
  details?: string
) {
  const icon = success ? "✅" : "❌";
  console.log(`${icon} ${test} (${duration}ms)`);
  if (details) {
    console.log(`   ${details}`);
  }
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  let passed = 0;
  let failed = 0;
  let roomId: string;

  // Test 1: Create room
  console.log("\n📋 Test 1: Create Room");
  try {
    const start = Date.now();
    roomId = await createRoom();
    logResult(
      "Create room",
      true,
      Date.now() - start,
      `Room ID: ${roomId.substring(0, 8)}...`
    );
    passed++;
  } catch (error) {
    logResult("Create room", false, 0, String(error));
    failed++;
    console.error("\n❌ Cannot continue without a room. Exiting.");
    process.exit(1);
  }

  // Test 2: Basic message (non-streaming)
  console.log("\n📋 Test 2: Basic Message (Non-Streaming)");
  try {
    const start = Date.now();
    const response = await sendMessage(
      roomId,
      "Hello! This is a connection pool test."
    );
    const text = response.message?.content?.text || "";
    logResult(
      "Basic message",
      true,
      Date.now() - start,
      `Response: ${text.substring(0, 50)}...`
    );
    passed++;
  } catch (error) {
    logResult("Basic message", false, 0, String(error));
    failed++;
  }

  // Test 3: Streaming message
  console.log("\n📋 Test 3: Streaming Message");
  try {
    const start = Date.now();
    const text = await sendStreamMessage(roomId, "Tell me a short joke.");
    logResult(
      "Streaming message",
      true,
      Date.now() - start,
      `Response: ${text.substring(0, 50)}...`
    );
    passed++;
  } catch (error) {
    logResult("Streaming message", false, 0, String(error));
    failed++;
  }

  // Test 4: Rapid sequential messages (stress test)
  console.log("\n📋 Test 4: Rapid Sequential Messages (x3)");
  const messages = [
    "First quick message",
    "Second quick message",
    "Third quick message",
  ];
  let rapidSuccess = 0;

  for (let i = 0; i < messages.length; i++) {
    try {
      const start = Date.now();
      await sendMessage(roomId, messages[i]);
      console.log(`   ✅ Message ${i + 1}: ${Date.now() - start}ms`);
      rapidSuccess++;
    } catch (error) {
      console.log(`   ❌ Message ${i + 1}: ${error}`);
    }
  }

  if (rapidSuccess === messages.length) {
    logResult(
      "Rapid messages",
      true,
      0,
      `${rapidSuccess}/${messages.length} succeeded`
    );
    passed++;
  } else {
    logResult(
      "Rapid messages",
      false,
      0,
      `${rapidSuccess}/${messages.length} succeeded`
    );
    failed++;
  }

  // Test 5: Simulated "character update" flow
  // This tests the critical fix: can we continue chatting after runtime invalidation?
  console.log("\n📋 Test 5: Character Update Simulation");
  console.log(
    "   (This simulates: send message → update character → send another message)"
  );

  // Create a new room to isolate this test
  try {
    const newRoomId = await createRoom();
    console.log(`   Created test room: ${newRoomId.substring(0, 8)}...`);

    // Step 1: Send initial message
    const start1 = Date.now();
    await sendMessage(newRoomId, "Hi! This is before the 'character update'.");
    console.log(`   ✅ Pre-update message: ${Date.now() - start1}ms`);

    // Step 2: The "character update" happens server-side when you edit a character
    // We can't trigger invalidation directly via API, but we can:
    // - Wait a moment (simulates the update happening)
    // - Then send another message
    console.log("   ⏳ Simulating character update delay...");
    await new Promise((r) => setTimeout(r, 1000));

    // Step 3: Send post-update message
    // Before the fix: This would fail with connection errors
    // After the fix: This should work
    const start2 = Date.now();
    await sendMessage(
      newRoomId,
      "Hi! This is AFTER the 'character update'. Did it work?"
    );
    console.log(`   ✅ Post-update message: ${Date.now() - start2}ms`);

    logResult(
      "Character update simulation",
      true,
      0,
      "Both messages succeeded"
    );
    passed++;
  } catch (error) {
    logResult("Character update simulation", false, 0, String(error));
    failed++;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed. Check the output above for details.");
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed! Connection pool is healthy.");
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("\n❌ Test runner error:", error);
  process.exit(1);
});
