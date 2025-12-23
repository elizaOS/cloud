/**
 * A2A Types and Configuration Tests
 *
 * Tests A2A type helpers and configuration values.
 * These tests run without a server.
 */

import { describe, test, expect } from "bun:test";
import {
  createTextPart,
  createDataPart,
  createFilePart,
  createTask,
  createTaskStatus,
  createArtifact,
  createMessage,
  jsonRpcSuccess,
  jsonRpcError,
  A2AErrorCodes,
  type Part,
  type MessageSendParams,
  type TaskGetParams,
} from "@/lib/types/a2a";
import {
  A2A_PROTOCOL_VERSION,
  A2A_JSONRPC_ENDPOINT,
  A2A_STANDARD_METHODS,
  A2A_SKILLS,
  A2A_RATE_LIMITS,
} from "@/lib/config/a2a";

describe("A2A Part Types", () => {
  test("text part", () => {
    const part = createTextPart("Hello");
    expect(part.type).toBe("text");
    expect(part.text).toBe("Hello");
  });

  test("data part", () => {
    const part = createDataPart({ key: "value" });
    expect(part.type).toBe("data");
    expect(part.data.key).toBe("value");
  });

  test("file part", () => {
    const part = createFilePart({ uri: "https://example.com/file.png" });
    expect(part.type).toBe("file");
    expect(part.file.uri).toBe("https://example.com/file.png");
  });
});

describe("A2A Message", () => {
  test("creates message with parts", () => {
    const parts: Part[] = [
      createTextPart("Hello"),
      createDataPart({ skill: "chat_completion" }),
    ];
    const message = createMessage("user", parts, { custom: "meta" });

    expect(message.role).toBe("user");
    expect(message.parts.length).toBe(2);
    expect(message.metadata?.custom).toBe("meta");
  });
});

describe("A2A Task", () => {
  test("creates task with status", () => {
    const task = createTask("task-1", "working", undefined, "ctx-1", {
      source: "test",
    });

    expect(task.id).toBe("task-1");
    expect(task.contextId).toBe("ctx-1");
    expect(task.status.state).toBe("working");
    expect(task.metadata?.source).toBe("test");
  });

  test("updates task status", () => {
    const task = createTask("t1", "working");
    task.status = createTaskStatus(
      "completed",
      createMessage("agent", [createTextPart("Done")])
    );

    expect(task.status.state).toBe("completed");
    expect(task.status.message?.parts[0].type).toBe("text");
  });
});

describe("A2A Artifact", () => {
  test("creates artifact with metadata", () => {
    const artifact = createArtifact(
      [createTextPart("Result")],
      "output",
      "description",
      0,
      { cost: 0.001 }
    );

    expect(artifact.name).toBe("output");
    expect(artifact.parts.length).toBe(1);
    expect(artifact.metadata?.cost).toBe(0.001);
  });
});

describe("JSON-RPC 2.0 Helpers", () => {
  test("success response", () => {
    const response = jsonRpcSuccess({ content: "Hello" }, "req-1");

    expect(response.jsonrpc).toBe("2.0");
    expect(response.result).toEqual({ content: "Hello" });
    expect(response.id).toBe("req-1");
    expect("error" in response).toBe(false);
  });

  test("error response", () => {
    const response = jsonRpcError(-32600, "Invalid Request", "req-2");

    expect(response.jsonrpc).toBe("2.0");
    expect(response.error.code).toBe(-32600);
    expect(response.id).toBe("req-2");
    expect("result" in response).toBe(false);
  });
});

describe("A2A Error Codes", () => {
  test("JSON-RPC standard errors", () => {
    expect(A2AErrorCodes.PARSE_ERROR).toBe(-32700);
    expect(A2AErrorCodes.INVALID_REQUEST).toBe(-32600);
    expect(A2AErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
    expect(A2AErrorCodes.INTERNAL_ERROR).toBe(-32603);
  });

  test("A2A custom errors", () => {
    expect(A2AErrorCodes.TASK_NOT_FOUND).toBe(-32001);
    expect(A2AErrorCodes.AUTHENTICATION_REQUIRED).toBe(-32010);
    expect(A2AErrorCodes.INSUFFICIENT_CREDITS).toBe(-32011);
    expect(A2AErrorCodes.RATE_LIMITED).toBe(-32012);
  });
});

describe("A2A Configuration", () => {
  test("protocol version", () => {
    expect(A2A_PROTOCOL_VERSION).toBe("0.3.0");
  });

  test("endpoint", () => {
    expect(A2A_JSONRPC_ENDPOINT).toBe("/api/a2a");
  });

  test("standard methods (actually implemented)", () => {
    expect(A2A_STANDARD_METHODS).toContain("message/send");
    expect(A2A_STANDARD_METHODS).toContain("tasks/get");
    expect(A2A_STANDARD_METHODS).toContain("tasks/cancel");
    expect(A2A_STANDARD_METHODS.length).toBe(3);
  });

  test("skills (invoked via message/send)", () => {
    expect(A2A_SKILLS).toContain("chat_completion");
    expect(A2A_SKILLS).toContain("check_balance");
    expect(A2A_SKILLS).toContain("list_agents");
    expect(A2A_SKILLS).toContain("save_memory");
    expect(A2A_SKILLS.length).toBe(12);
  });

  test("rate limits scale with trust", () => {
    expect(A2A_RATE_LIMITS.untrusted).toBeLessThan(A2A_RATE_LIMITS.low);
    expect(A2A_RATE_LIMITS.low).toBeLessThan(A2A_RATE_LIMITS.neutral);
    expect(A2A_RATE_LIMITS.neutral).toBeLessThan(A2A_RATE_LIMITS.trusted);
    expect(A2A_RATE_LIMITS.trusted).toBeLessThan(A2A_RATE_LIMITS.verified);
  });
});

describe("Message Param Types", () => {
  test("MessageSendParams structure", () => {
    const params: MessageSendParams = {
      message: createMessage("user", [createTextPart("Hello")]),
      configuration: { acceptedOutputModes: ["text"], blocking: true },
    };

    expect(params.message.role).toBe("user");
    expect(params.configuration?.blocking).toBe(true);
  });

  test("TaskGetParams structure", () => {
    const params: TaskGetParams = { id: "task-1", historyLength: 10 };
    expect(params.id).toBe("task-1");
    expect(params.historyLength).toBe(10);
  });
});
