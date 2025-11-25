/**
 * Test to see ALL character fields
 */

import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq } from "drizzle-orm";

async function testFullCharacter() {
  console.log("\n🔍 Testing Full Character Data for Luna...\n");
  
  try {
    const lunaChars = await db
      .select()
      .from(userCharacters)
      .where(eq(userCharacters.name, "Luna"))
      .limit(1);
    
    if (lunaChars.length === 0) {
      console.log("❌ Luna character not found");
      return;
    }
    
    const luna = lunaChars[0];
    
    console.log("📝 Character:", luna.name);
    console.log("\n" + "=".repeat(80));
    console.log("BIO:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.bio, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("POST_EXAMPLES:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.post_examples, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("TOPICS:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.topics, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("ADJECTIVES:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.adjectives, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("KNOWLEDGE:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.knowledge, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("STYLE:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.style, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("CHARACTER_DATA:");
    console.log("=".repeat(80));
    console.log(JSON.stringify(luna.character_data, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("SYSTEM:");
    console.log("=".repeat(80));
    console.log(luna.system);
    
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Details:", error.message);
    }
  } finally {
    process.exit(0);
  }
}

testFullCharacter();

