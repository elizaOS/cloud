/**
 * Test script to validate Response polyfill behavior
 *
 * Run with: bun run scripts/test-response-polyfill.ts
 *
 * This demonstrates the issue described in GitHub #58611:
 * When cross-fetch/undici polyfill Response AFTER NextResponse is defined,
 * instanceof checks fail.
 */

import { NextResponse } from "next/server";

console.log("=== Response Polyfill Test ===\n");

// Test 1: Check if Response is the native one or polyfilled
console.log("1. Response constructor check:");
console.log("   Response.name:", Response.name);
console.log("   typeof Response:", typeof Response);

// Test 2: Check NextResponse inheritance
console.log("\n2. NextResponse inheritance:");
const nextResp = NextResponse.json({ test: true });
console.log("   nextResp instanceof Response:", nextResp instanceof Response);
console.log(
  "   nextResp instanceof NextResponse:",
  nextResp instanceof NextResponse,
);
console.log("   nextResp.constructor.name:", nextResp.constructor.name);

// Test 3: Check globalThis.Response
console.log("\n3. globalThis.Response:");
console.log(
  "   globalThis.Response === Response:",
  globalThis.Response === Response,
);
const globalResp = new globalThis.Response(JSON.stringify({ test: true }), {
  headers: { "Content-Type": "application/json" },
});
console.log(
  "   globalResp instanceof Response:",
  globalResp instanceof Response,
);
console.log(
  "   globalResp instanceof globalThis.Response:",
  globalResp instanceof globalThis.Response,
);

// Test 4: Simulate catch block scenario
console.log("\n4. Catch block simulation:");
async function simulateRouteHandler() {
  try {
    throw new Error("Simulated auth error");
  } catch (error) {
    // This is what fails in Turbopack when polyfill is active
    const nextJsonResp = NextResponse.json({ error: "test" }, { status: 401 });
    console.log(
      "   NextResponse.json instanceof Response:",
      nextJsonResp instanceof Response,
    );

    // This should always work
    const globalJsonResp = new globalThis.Response(
      JSON.stringify({ error: "test" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
    console.log(
      "   globalThis.Response instanceof Response:",
      globalJsonResp instanceof Response,
    );

    return { nextJsonResp, globalJsonResp };
  }
}

await simulateRouteHandler();

// Test 5: Check prototype chain
console.log("\n5. Prototype chain:");
console.log(
  "   NextResponse.prototype:",
  Object.getPrototypeOf(NextResponse.prototype)?.constructor?.name,
);
console.log(
  "   Response.prototype:",
  Object.getPrototypeOf(Response.prototype)?.constructor?.name,
);

// Test 6: Import order simulation
console.log("\n6. Import order effect:");
console.log("   If you see 'false' for instanceof checks above,");
console.log("   it means the polyfill has overwritten Response.");
console.log("   Solution: Use globalThis.Response in catch blocks.");

console.log("\n=== Test Complete ===");
