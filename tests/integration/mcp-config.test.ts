/**
 * MCP Protocol Integration Tests
 */

import { describe, test, expect } from "bun:test";
import {
  MCP_REQUEST_TIMEOUT,
  SSE_MAX_DURATION,
  SSE_POLL_INTERVAL_MS,
  SSE_BACKOFF_INITIAL_MS,
  SSE_BACKOFF_MAX_MS,
  SSE_BACKOFF_MULTIPLIER,
  MEMORY_SAVE_COST,
  MEMORY_RETRIEVAL_COST_PER_ITEM,
  MEMORY_RETRIEVAL_MAX_COST,
  CONTEXT_RETRIEVAL_COST,
  MCP_EVENT_TYPES,
} from "@/lib/config/mcp";

const MCP_TOOLS = [
  "check_credits",
  "stream_credit_updates",
  "get_credit_summary",
  "list_credit_transactions",
  "list_credit_packs",
  "get_billing_usage",
  "get_recent_usage",
  "generate_text",
  "generate_image",
  "generate_video",
  "generate_embeddings",
  "generate_prompts",
  "save_memory",
  "retrieve_memories",
  "delete_memory",
  "analyze_memory_patterns",
  "query_knowledge",
  "upload_knowledge",
  "get_conversation_context",
  "summarize_conversation",
  "optimize_context_window",
  "chat_with_agent",
  "list_agents",
  "subscribe_agent_events",
  "create_agent",
  "update_agent",
  "delete_agent",
  "list_containers",
  "get_container",
  "get_container_health",
  "get_container_logs",
  "create_container",
  "delete_container",
  "get_container_metrics",
  "get_container_quota",
  "list_models",
  "list_gallery",
  "get_analytics",
  "text_to_speech",
  "list_voices",
  "list_api_keys",
  "create_api_key",
  "delete_api_key",
  "get_redemption_balance",
  "get_redemption_quote",
  "list_mcps",
  "create_mcp",
  "delete_mcp",
  "list_rooms",
  "create_room",
  "get_user_profile",
  "update_user_profile",
  "discover_services",
  "get_service_details",
  "find_mcp_tools",
  "find_a2a_skills",
] as const;

describe("MCP Configuration", () => {
  test("timeouts are reasonable", () => {
    expect(MCP_REQUEST_TIMEOUT).toBeGreaterThan(0);
    expect(MCP_REQUEST_TIMEOUT).toBeLessThanOrEqual(300);
    expect(SSE_MAX_DURATION).toBeGreaterThan(0);
    expect(SSE_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });

  test("SSE backoff is exponential", () => {
    expect(SSE_BACKOFF_INITIAL_MS).toBeLessThan(SSE_BACKOFF_MAX_MS);
    expect(SSE_BACKOFF_MULTIPLIER).toBeGreaterThan(1);
  });

  test("credit costs are positive", () => {
    expect(MEMORY_SAVE_COST).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_COST_PER_ITEM).toBeGreaterThan(0);
    expect(MEMORY_RETRIEVAL_MAX_COST).toBeGreaterThan(
      MEMORY_RETRIEVAL_COST_PER_ITEM,
    );
    expect(CONTEXT_RETRIEVAL_COST).toBeGreaterThan(0);
  });

  test("event types are defined", () => {
    expect(MCP_EVENT_TYPES.AGENT).toBe("agent");
    expect(MCP_EVENT_TYPES.CREDITS).toBe("credits");
    expect(MCP_EVENT_TYPES.CONTAINER).toBe("container");
  });
});

describe("MCP Tools", () => {
  test("has 56 tools", () => {
    expect(MCP_TOOLS.length).toBe(56);
  });

  test("tool names are snake_case", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool).toMatch(/^[a-z][a-z0-9_]*[a-z0-9]$/);
    }
  });

  test("has required categories", () => {
    // Credits
    expect(MCP_TOOLS).toContain("check_credits");
    expect(MCP_TOOLS).toContain("stream_credit_updates");

    // Generation
    expect(MCP_TOOLS).toContain("generate_text");
    expect(MCP_TOOLS).toContain("generate_image");
    expect(MCP_TOOLS).toContain("generate_video");

    // Memory
    expect(MCP_TOOLS).toContain("save_memory");
    expect(MCP_TOOLS).toContain("retrieve_memories");
    expect(MCP_TOOLS).toContain("delete_memory");

    // Agents
    expect(MCP_TOOLS).toContain("chat_with_agent");
    expect(MCP_TOOLS).toContain("list_agents");
    expect(MCP_TOOLS).toContain("create_agent");

    // Containers
    expect(MCP_TOOLS).toContain("list_containers");
    expect(MCP_TOOLS).toContain("create_container");

    // Discovery
    expect(MCP_TOOLS).toContain("discover_services");
    expect(MCP_TOOLS).toContain("find_mcp_tools");
    expect(MCP_TOOLS).toContain("find_a2a_skills");
  });
});
