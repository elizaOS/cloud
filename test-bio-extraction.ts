/**
 * Test script to check what data the affiliate provider is extracting
 */

import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq } from "drizzle-orm";

async function testBioExtraction() {
  console.log("\n🔍 Testing Bio Extraction for Luna Character...\n");
  
  try {
    // Find Luna character
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
    
    console.log("📝 Character Name:", luna.name);
    console.log("📋 Character ID:", luna.id);
    console.log("\n" + "=".repeat(80));
    console.log("RAW BIO DATA:");
    console.log("=".repeat(80));
    console.log("Bio type:", Array.isArray(luna.bio) ? "Array" : typeof luna.bio);
    
    if (Array.isArray(luna.bio)) {
      console.log(`Bio has ${luna.bio.length} elements:\n`);
      luna.bio.forEach((line, i) => {
        console.log(`[${i}] ${line}`);
      });
    } else {
      console.log("Bio:", luna.bio);
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("BIO JOINED WITH NEWLINE:");
    console.log("=".repeat(80));
    const bioText = Array.isArray(luna.bio) ? luna.bio.join("\n") : (luna.bio as string || "");
    console.log(bioText);
    
    console.log("\n" + "=".repeat(80));
    console.log("BIO JOINED WITH SPACE:");
    console.log("=".repeat(80));
    const bioTextSpace = Array.isArray(luna.bio) ? luna.bio.join(" ") : (luna.bio as string || "");
    console.log(bioTextSpace);
    
    console.log("\n" + "=".repeat(80));
    console.log("AFFILIATE DATA:");
    console.log("=".repeat(80));
    const characterData = luna.character_data as Record<string, unknown>;
    const affiliate = characterData?.affiliate as Record<string, unknown> | undefined;
    console.log(JSON.stringify(affiliate, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("REGEX EXTRACTION TEST:");
    console.log("=".repeat(80));
    
    // Test Instagram extraction
    const instagramMatch = bioText.match(/Instagram:\s*@?([a-zA-Z0-9._]+)(?:\s*\(.*?\))?\s*(.*)$/im);
    console.log("\n📸 Instagram Match:");
    if (instagramMatch) {
      console.log("  Full match:", instagramMatch[0]);
      console.log("  Handle:", instagramMatch[1]);
      console.log("  Rest:", instagramMatch[2]);
    } else {
      console.log("  No match found");
    }
    
    // Test Twitter extraction
    const twitterMatch = bioText.match(/Twitter:\s*@?([a-zA-Z0-9._]+)(?:\s*\(.*?\))?\s*(.*)$/im);
    console.log("\n🐦 Twitter Match:");
    if (twitterMatch) {
      console.log("  Full match:", twitterMatch[0]);
      console.log("  Handle:", twitterMatch[1]);
      console.log("  Rest:", twitterMatch[2]);
    } else {
      console.log("  No match found");
    }
    
    // Test Recent Posts extraction
    const recentPostsMatch = bioText.match(/Recent Posts?:?([\s\S]*?)(?:\n\n|$)/i);
    console.log("\n📝 Recent Posts Match:");
    if (recentPostsMatch) {
      console.log("  Full match length:", recentPostsMatch[0].length);
      console.log("  Captured content:", recentPostsMatch[1]);
    } else {
      console.log("  No match found");
    }
    
    // Test Their Vibe extraction
    const theirVibeMatch = bioText.match(/Their vibe:?([\s\S]*?)(?:\n\n|$)/i);
    console.log("\n✨ Their Vibe Match:");
    if (theirVibeMatch) {
      console.log("  Full match length:", theirVibeMatch[0].length);
      console.log("  Captured content:", theirVibeMatch[1]);
    } else {
      console.log("  No match found");
    }
    
    // Try alternative extraction
    console.log("\n" + "=".repeat(80));
    console.log("ALTERNATIVE EXTRACTION (finding all content after Instagram/Twitter):");
    console.log("=".repeat(80));
    
    const instagramIndex = bioText.indexOf("Instagram:");
    const twitterIndex = bioText.indexOf("Twitter:");
    
    if (instagramIndex !== -1) {
      const afterInstagram = bioText.substring(instagramIndex);
      console.log("\n📸 Content after 'Instagram:':");
      console.log(afterInstagram.substring(0, 300) + "...");
    }
    
    if (twitterIndex !== -1) {
      const afterTwitter = bioText.substring(twitterIndex);
      console.log("\n🐦 Content after 'Twitter:':");
      console.log(afterTwitter.substring(0, 300) + "...");
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Details:", error.message);
    }
  } finally {
    process.exit(0);
  }
}

testBioExtraction();

