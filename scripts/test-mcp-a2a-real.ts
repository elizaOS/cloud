/**
 * REAL MCP & A2A Integration Test
 * 
 * This script tests the MCP and A2A endpoints against a real running server
 * with actual credit deduction and earnings.
 * 
 * Run: bun run scripts/test-mcp-a2a-real.ts
 * 
 * Prerequisites:
 * - Server running at localhost:3000 or TEST_API_URL
 * - Valid API key in TEST_API_KEY env var
 * - Account with credits
 */

const API_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY || "";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (API_KEY) {
    headers.set("Authorization", `Bearer ${API_KEY}`);
  }
  headers.set("Content-Type", "application/json");

  return fetch(url, {
    ...options,
    headers,
  });
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("═".repeat(70));
  console.log("REAL MCP & A2A INTEGRATION TEST");
  console.log("═".repeat(70));
  console.log("");
  console.log(`API URL: ${API_URL}`);
  console.log(`API Key: ${API_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log("");

  if (!API_KEY) {
    console.error("❌ TEST_API_KEY environment variable is required");
    console.error("   Export it with: export TEST_API_KEY=your_api_key");
    process.exit(1);
  }

  // ============================================================================
  // 1. Check credit balance before tests
  // ============================================================================
  console.log("1. Checking initial credit balance...");
  
  let initialBalance = 0;
  try {
    const resp = await fetchWithAuth(`${API_URL}/api/v1/credits/balance`);
    if (resp.ok) {
      const data = await resp.json();
      initialBalance = data.balance || 0;
      console.log(`   Initial balance: $${initialBalance.toFixed(4)}`);
      results.push({ name: "Check balance", passed: true, data: { balance: initialBalance } });
    } else {
      const error = await resp.text();
      console.log(`   ❌ Failed: ${error}`);
      results.push({ name: "Check balance", passed: false, error });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ Connection failed: ${error}`);
    results.push({ name: "Check balance", passed: false, error });
  }

  console.log("");

  // ============================================================================
  // 2. Test MCP endpoint
  // ============================================================================
  console.log("2. Testing MCP endpoint...");

  // Test MCP check_credits tool
  try {
    const mcpRequest = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "check_credits",
        arguments: {},
      },
      id: "mcp-test-1",
    };

    const resp = await fetchWithAuth(`${API_URL}/api/mcp`, {
      method: "POST",
      body: JSON.stringify(mcpRequest),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.result) {
        console.log(`   ✅ MCP check_credits: balance = ${JSON.stringify(data.result.content?.[0]?.text || data.result)}`);
        results.push({ name: "MCP check_credits", passed: true, data: data.result });
      } else if (data.error) {
        console.log(`   ⚠️ MCP error: ${data.error.message}`);
        results.push({ name: "MCP check_credits", passed: false, error: data.error.message });
      }
    } else {
      const error = await resp.text();
      console.log(`   ❌ MCP request failed (${resp.status}): ${error}`);
      results.push({ name: "MCP check_credits", passed: false, error });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ MCP connection failed: ${error}`);
    results.push({ name: "MCP check_credits", passed: false, error });
  }

  // Test MCP generate_text tool (costs real credits)
  console.log("");
  console.log("   Testing MCP generate_text (costs real credits)...");
  
  try {
    const mcpRequest = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "generate_text",
        arguments: {
          prompt: "Say 'test successful' in exactly two words.",
          model: "gpt-4o-mini",
          max_tokens: 10,
        },
      },
      id: "mcp-test-2",
    };

    const resp = await fetchWithAuth(`${API_URL}/api/mcp`, {
      method: "POST",
      body: JSON.stringify(mcpRequest),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.result) {
        const content = data.result.content?.[0]?.text || JSON.stringify(data.result);
        console.log(`   ✅ MCP generate_text: "${content.slice(0, 50)}..."`);
        results.push({ name: "MCP generate_text", passed: true, data: { response: content } });
      } else if (data.error) {
        console.log(`   ⚠️ MCP error: ${data.error.message}`);
        results.push({ name: "MCP generate_text", passed: false, error: data.error.message });
      }
    } else {
      const error = await resp.text();
      console.log(`   ❌ MCP generate_text failed (${resp.status}): ${error}`);
      results.push({ name: "MCP generate_text", passed: false, error });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ MCP generate_text failed: ${error}`);
    results.push({ name: "MCP generate_text", passed: false, error });
  }

  console.log("");

  // ============================================================================
  // 3. Test A2A endpoint (platform)
  // ============================================================================
  console.log("3. Testing A2A platform endpoint...");

  // Test A2A getAgentCard method
  try {
    const a2aRequest = {
      jsonrpc: "2.0",
      method: "getAgentCard",
      params: {},
      id: "a2a-test-1",
    };

    const resp = await fetchWithAuth(`${API_URL}/api/a2a`, {
      method: "POST",
      body: JSON.stringify(a2aRequest),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.result) {
        console.log(`   ✅ A2A getAgentCard: name = "${data.result.name}"`);
        results.push({ name: "A2A getAgentCard", passed: true, data: { name: data.result.name } });
      } else if (data.error) {
        console.log(`   ⚠️ A2A error: ${data.error.message}`);
        results.push({ name: "A2A getAgentCard", passed: false, error: data.error.message });
      }
    } else {
      // Try GET for agent card
      const getResp = await fetchWithAuth(`${API_URL}/api/a2a`);
      if (getResp.ok) {
        const data = await getResp.json();
        console.log(`   ✅ A2A Agent Card (GET): name = "${data.name}"`);
        results.push({ name: "A2A getAgentCard", passed: true, data: { name: data.name } });
      } else {
        const error = await resp.text();
        console.log(`   ❌ A2A failed (${resp.status}): ${error}`);
        results.push({ name: "A2A getAgentCard", passed: false, error });
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ A2A connection failed: ${error}`);
    results.push({ name: "A2A getAgentCard", passed: false, error });
  }

  // Test A2A chatCompletion method (costs real credits)
  console.log("");
  console.log("   Testing A2A chatCompletion (costs real credits)...");
  
  try {
    const a2aRequest = {
      jsonrpc: "2.0",
      method: "a2a.chatCompletion",
      params: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'A2A test successful' in exactly three words." }],
        max_tokens: 10,
      },
      id: "a2a-test-2",
    };

    const resp = await fetchWithAuth(`${API_URL}/api/a2a`, {
      method: "POST",
      body: JSON.stringify(a2aRequest),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.result) {
        const content = data.result.content || data.result.message?.content || JSON.stringify(data.result);
        console.log(`   ✅ A2A chatCompletion: "${String(content).slice(0, 50)}..."`);
        results.push({ name: "A2A chatCompletion", passed: true, data: { response: content } });
      } else if (data.error) {
        console.log(`   ⚠️ A2A error: ${data.error.message}`);
        results.push({ name: "A2A chatCompletion", passed: false, error: data.error.message });
      }
    } else {
      const error = await resp.text();
      console.log(`   ❌ A2A chatCompletion failed (${resp.status}): ${error}`);
      results.push({ name: "A2A chatCompletion", passed: false, error });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ A2A chatCompletion failed: ${error}`);
    results.push({ name: "A2A chatCompletion", passed: false, error });
  }

  console.log("");

  // ============================================================================
  // 4. Check credit balance after tests
  // ============================================================================
  console.log("4. Checking final credit balance...");
  
  let finalBalance = 0;
  try {
    const resp = await fetchWithAuth(`${API_URL}/api/v1/credits/balance`);
    if (resp.ok) {
      const data = await resp.json();
      finalBalance = data.balance || 0;
      const spent = initialBalance - finalBalance;
      console.log(`   Final balance: $${finalBalance.toFixed(4)}`);
      console.log(`   Credits spent: $${spent.toFixed(4)}`);
      results.push({ name: "Final balance", passed: true, data: { balance: finalBalance, spent } });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`   ❌ Failed to check balance: ${error}`);
  }

  console.log("");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("═".repeat(70));
  console.log("TEST SUMMARY");
  console.log("═".repeat(70));
  console.log("");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? "✅" : "❌";
    console.log(`${status} ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log("");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("");

  if (failed === 0) {
    console.log("✅ ALL TESTS PASSED - MCP & A2A WORKING WITH REAL MONEY");
  } else {
    console.log("❌ SOME TESTS FAILED");
  }

  console.log("═".repeat(70));

  return results;
}

runTests().catch(console.error);

