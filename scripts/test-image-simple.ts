#!/usr/bin/env bun
/**
 * Simple test script for image description functionality
 * Tests that the /chat/completions endpoint correctly handles images
 */

const TEST_IMAGE_URL =
  "https://lemagdesanimaux.ouest-france.fr/images/dossiers/2020-09/tigre-093341.jpg";

// Use API key from command line argument or environment
const API_KEY = process.argv[2] || process.env.TEST_API_KEY;

if (!API_KEY) {
  console.error(
    "❌ Please provide an API key as argument or TEST_API_KEY env var",
  );
  console.error("Usage: bun scripts/test-image-simple.ts <API_KEY>");
  process.exit(1);
}

async function testImageDescription() {
  const baseUrl = "http://localhost:3333/api/v1";

  console.log("🚀 Starting image description test...\n");
  console.log(
    "🖼️  Testing image description with /chat/completions endpoint...",
  );
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`🔑 Using API key: ${API_KEY.substring(0, 10)}...`);

  const requestBody = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this image in detail. What animal is this?",
          },
          {
            type: "image_url",
            image_url: {
              url: TEST_IMAGE_URL,
            },
          },
        ],
      },
    ],
    max_tokens: 500,
  };

  console.log("\n📤 Request body:");
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(
      `\n📥 Response status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error response:");
      console.error(errorText);
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log("\n✅ Success! Response:");
    console.log(JSON.stringify(result, null, 2));

    // Check if we got a meaningful response about the image
    const content = result.choices?.[0]?.message?.content || "";
    console.log("\n📝 Response content:");
    console.log(content);

    // Validate that the response mentions something about the image
    const hasImageDescription =
      content.length > 50 && // Should be a substantial response
      (content.toLowerCase().includes("person") ||
        content.toLowerCase().includes("man") ||
        content.toLowerCase().includes("photo") ||
        content.toLowerCase().includes("image") ||
        content.toLowerCase().includes("vitalik"));

    if (!hasImageDescription) {
      console.warn(
        "\n⚠️  Warning: Response doesn't seem to describe the image properly",
      );
      console.warn("This might indicate the image wasn't processed correctly");
    } else {
      console.log("\n✨ Image was successfully processed and described!");
    }

    console.log("\n🎉 Test completed successfully!");
    return result;
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    throw error;
  }
}

testImageDescription()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
