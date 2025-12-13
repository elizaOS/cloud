import { randomString, randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const AGENT_NAMES = ["Atlas", "Nova", "Echo", "Sage", "Aria", "Cipher", "Luna", "Nexus", "Phoenix", "Vega"];
const AGENT_BIOS = ["Helpful assistant", "Data analyst", "Creative writer", "Tech support"];

export function generateAgentName() {
  return `LoadTest-${AGENT_NAMES[randomIntBetween(0, AGENT_NAMES.length - 1)]}-${randomString(4)}`;
}

export function generateAgentPayload() {
  return {
    name: generateAgentName(),
    bio: [AGENT_BIOS[randomIntBetween(0, AGENT_BIOS.length - 1)]],
    model: "gpt-4o-mini",
    settings: { secrets: {} },
  };
}

export function generateChatMessage() {
  const msgs = ["Hello", "What can you help with?", "Tell me a fact", "Say 'test' only"];
  return msgs[randomIntBetween(0, msgs.length - 1)];
}

export function generateApiKeyName() {
  return `LoadTest-Key-${randomString(8)}`;
}

export function generateConversationTitle() {
  return `LoadTest-Convo-${randomString(6)}`;
}

export function generateKnowledgeContent() {
  return `Load test knowledge: ${randomString(100)}`;
}

export function generateMemoryContent() {
  return `Load test memory: ${randomString(50)}`;
}

export function generateTestFile() {
  return { content: `Test file: ${randomString(200)}`, name: `loadtest-${randomString(8)}.txt`, mimeType: "text/plain" };
}
