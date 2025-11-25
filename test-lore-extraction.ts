/**
 * Test the updated affiliate context provider with lore extraction
 */

import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { affiliateContextProvider } from "@/lib/eliza/plugin-assistant/providers/affiliate-context";
import type { Memory } from "@elizaos/core";

async function testLoreExtraction() {
  console.log("\n🔍 Testing Updated Affiliate Context Provider with Lore...\n");
  
  try {
    // Find a character with Instagram/Twitter data - use the one from query results
    const characterId = "25d0a128-69ab-444e-abc7-588753edee70"; // eliza character
    
    console.log(`📝 Loading runtime for character: ${characterId}\n`);
    
    const runtime = await agentRuntime.getRuntimeForCharacter(characterId);
    
    console.log(`✓ Runtime loaded for: ${runtime.character.name}\n`);
    
    // Check if character has lore
    const char = (runtime.character as unknown) as Record<string, unknown>;
    console.log("📚 Character has lore field:", !!char.lore);
    if (char.lore) {
      const loreArray = char.lore as string[];
      console.log(`   Lore entries: ${loreArray.length}`);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("Testing Affiliate Context Provider:");
    console.log("=".repeat(80) + "\n");
    
    const mockMessage: Memory = {
      id: "test-msg" as any,
      userId: "test-user" as any,
      agentId: runtime.agentId,
      roomId: "test-room" as any,
      content: { text: "test" },
      createdAt: Date.now(),
    };
    
    const providerResult = await affiliateContextProvider.get(runtime, mockMessage, undefined);
    
    console.log("📊 Provider Result:");
    console.log(`   - Has text: ${providerResult.text ? "✅ YES" : "❌ NO"}`);
    console.log(`   - Text length: ${providerResult.text?.length || 0} characters`);
    console.log(`   - Has social context: ${providerResult.data?.hasSocialContext ? "✅ YES" : "❌ NO"}`);
    console.log(`   - Has Instagram: ${providerResult.data?.hasInstagram ? "✅ YES" : "❌ NO"}`);
    console.log(`   - Has Twitter: ${providerResult.data?.hasTwitter ? "✅ YES" : "❌ NO"}`);
    console.log(`   - Has Recent Posts: ${providerResult.data?.hasRecentPosts ? "✅ YES" : "❌ NO"}`);
    
    if (providerResult.text) {
      console.log("\n" + "=".repeat(80));
      console.log("📄 EXTRACTED CONTEXT (first 1000 chars):");
      console.log("=".repeat(80));
      console.log(providerResult.text.substring(0, 1000));
      if (providerResult.text.length > 1000) {
        console.log("\n... (truncated, total length: " + providerResult.text.length + " characters)");
      }
      
      // Check if it contains key phrases
      console.log("\n" + "=".repeat(80));
      console.log("✅ VALIDATION CHECKS:");
      console.log("=".repeat(80));
      const text = providerResult.text.toLowerCase();
      console.log(`   Contains "Instagram": ${text.includes("instagram") ? "✅ YES" : "❌ NO"}`);
      console.log(`   Contains "Twitter": ${text.includes("twitter") ? "✅ YES" : "❌ NO"}`);
      console.log(`   Contains "Recent Posts": ${text.includes("recent posts") ? "✅ YES" : "❌ NO"}`);
      console.log(`   Contains "InTheMoment": ${text.includes("inthemoment") || text.includes("#inthemoment") ? "✅ YES" : "❌ NO"}`);
      console.log(`   Contains social handles: ${text.includes("@") ? "✅ YES" : "❌ NO"}`);
    } else {
      console.log("\n❌ NO CONTEXT GENERATED!");
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST COMPLETE");
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("   Error details:", error.message);
      console.error("\n   Stack trace:");
      console.error(error.stack);
    }
  } finally {
    process.exit(0);
  }
}

testLoreExtraction();

