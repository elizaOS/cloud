/**
 * A2A Protocol Integration Tests
 */

import { describe, test, expect } from "bun:test";
import {
  TaskState,
  Part,
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
  MessageSendParams,
  TaskGetParams,
} from "@/lib/types/a2a";
import {
  A2A_PROTOCOL_VERSION,
  A2A_JSONRPC_ENDPOINT,
  A2A_STANDARD_METHODS,
  A2A_EXTENSION_METHODS,
  A2A_RATE_LIMITS,
} from "@/lib/config/a2a";

describe("A2A Types", () => {
  test("Part types are discriminated", () => {
    expect(createTextPart("Hello").type).toBe("text");
    expect(createDataPart({ key: "value" }).type).toBe("data");
    expect(createFilePart({ uri: "https://x.com/file.png" }).type).toBe("file");
  });

  test("Message structure", () => {
    const parts: Part[] = [createTextPart("Hello"), createDataPart({ skill: "chat" })];
    const message = createMessage("user", parts, { custom: "meta" });

    expect(message.role).toBe("user");
    expect(message.parts.length).toBe(2);
    expect(message.metadata?.custom).toBe("meta");
  });

  test("Task structure", () => {
    const task = createTask("task-1", "working", undefined, "ctx-1", { source: "test" });

    expect(task.id).toBe("task-1");
    expect(task.contextId).toBe("ctx-1");
    expect(task.status.state).toBe("working");
    expect(task.metadata?.source).toBe("test");
  });

  test("Artifact structure", () => {
    const artifact = createArtifact([createTextPart("Result")], "output", "desc", 0, { cost: 0.001 });

    expect(artifact.name).toBe("output");
    expect(artifact.parts.length).toBe(1);
    expect(artifact.metadata?.cost).toBe(0.001);
  });
});

describe("JSON-RPC 2.0", () => {
  test("success response", () => {
    const response = jsonRpcSuccess({ content: "Hello" }, "req-1");

    expect(response.jsonrpc).toBe("2.0");
    expect(response.result).toEqual({ content: "Hello" });
    expect(response.id).toBe("req-1");
    expect("error" in response).toBe(false);
  });

  test("error response", () => {
    const response = jsonRpcError(-32600, "Invalid Request", "req-2", { details: "missing" });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.error.code).toBe(-32600);
    expect(response.id).toBe("req-2");
    expect("result" in response).toBe(false);
  });

  test("error codes follow spec", () => {
    expect(A2AErrorCodes.PARSE_ERROR).toBe(-32700);
    expect(A2AErrorCodes.INVALID_REQUEST).toBe(-32600);
    expect(A2AErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
    expect(A2AErrorCodes.INTERNAL_ERROR).toBe(-32603);
  });

  test("A2A custom error codes", () => {
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

  test("standard methods", () => {
    expect(A2A_STANDARD_METHODS).toContain("message/send");
    expect(A2A_STANDARD_METHODS).toContain("tasks/get");
    expect(A2A_STANDARD_METHODS).toContain("tasks/cancel");
  });

  test("extension methods follow a2a.* convention", () => {
    for (const method of A2A_EXTENSION_METHODS) {
      expect(method.startsWith("a2a.")).toBe(true);
    }
  });

  test("rate limits scale with trust", () => {
    expect(A2A_RATE_LIMITS.untrusted).toBeLessThan(A2A_RATE_LIMITS.low);
    expect(A2A_RATE_LIMITS.low).toBeLessThan(A2A_RATE_LIMITS.neutral);
    expect(A2A_RATE_LIMITS.neutral).toBeLessThan(A2A_RATE_LIMITS.trusted);
    expect(A2A_RATE_LIMITS.trusted).toBeLessThan(A2A_RATE_LIMITS.verified);
  });
});

describe("Task Lifecycle", () => {
  test("transitions", () => {
    const task = createTask("t1", "working");
    expect(task.status.state).toBe("working");

    task.status = createTaskStatus("completed", createMessage("agent", [createTextPart("Done")]));
    expect(task.status.state).toBe("completed");

    const task2 = createTask("t2", "working");
    task2.status = createTaskStatus("canceled");
    expect(task2.status.state).toBe("canceled");
  });

  test("history accumulation", () => {
    const task = createTask("t3", "working");
    task.history = [
      createMessage("user", [createTextPart("Hello")]),
      createMessage("agent", [createTextPart("Hi!")]),
    ];

    expect(task.history.length).toBe(2);
    expect(task.history[0].role).toBe("user");
    expect(task.history[1].role).toBe("agent");
  });

  test("artifacts", () => {
    const task = createTask("t4", "working");
    task.artifacts = [
      createArtifact([createDataPart({ tokens: 100 })], "usage"),
      createArtifact([createFilePart({ uri: "https://x.com/img.png" })], "image"),
    ];

    expect(task.artifacts.length).toBe(2);
  });
});

describe("Message Formats", () => {
  test("message/send params", () => {
    const params: MessageSendParams = {
      message: createMessage("user", [createTextPart("Hello")]),
      configuration: { acceptedOutputModes: ["text"], blocking: true },
    };

    expect(params.message.role).toBe("user");
    expect(params.configuration?.blocking).toBe(true);
  });

  test("tasks/get params", () => {
    const params: TaskGetParams = { id: "task-1", historyLength: 10 };
    expect(params.id).toBe("task-1");
    expect(params.historyLength).toBe(10);
  });

  test("multi-part message", () => {
    const message = createMessage("user", [
      createTextPart("Analyze this"),
      createFilePart({ uri: "https://x.com/img.png", mimeType: "image/png" }),
      createDataPart({ width: 512 }),
    ]);

    expect(message.parts.length).toBe(3);
    expect(message.parts[0].type).toBe("text");
    expect(message.parts[1].type).toBe("file");
    expect(message.parts[2].type).toBe("data");
  });
});
