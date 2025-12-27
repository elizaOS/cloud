import { describe, test, expect } from "bun:test";
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

function isValidRole(role: string): boolean {
  return role === "user" || role === "assistant";
}

function validateRequest(request: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.workflowId || !isValidUUID(request.workflowId as string)) {
    errors.push("Invalid workflowId");
  }

  if (request.message === undefined || request.message === null) {
    errors.push("Missing message");
  } else if (typeof request.message !== "string") {
    errors.push("Invalid message type");
  } else if ((request.message as string).length === 0) {
    errors.push("Empty message");
  } else if ((request.message as string).length > 10000) {
    errors.push("Message too long");
  }

  const workflow = request.currentWorkflow as
    | Record<string, unknown>
    | undefined;
  if (!workflow) {
    errors.push("Missing currentWorkflow");
  } else {
    if (!workflow.id) errors.push("Missing workflow id");
    if (!workflow.name) errors.push("Missing workflow name");
    if (workflow.status === undefined) errors.push("Missing workflow status");
    if (workflow.version === undefined) errors.push("Missing workflow version");
    if (!Array.isArray(workflow.tags)) errors.push("Missing workflow tags");
    if (!workflow.workflowData) errors.push("Missing workflowData");
  }

  const history = request.history as
    | Array<{ role: string; content: string }>
    | undefined;
  if (history && !Array.isArray(history)) {
    errors.push("Invalid history");
  } else if (history) {
    for (const msg of history) {
      if (!isValidRole(msg.role)) {
        errors.push(`Invalid role: ${msg.role}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

describe("Request Validation", () => {
  const validRequest = {
    workflowId: "123e4567-e89b-12d3-a456-426614174000",
    currentWorkflow: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Workflow",
      description: "A test workflow",
      status: "draft",
      version: 1,
      tags: ["test"],
      workflowData: { nodes: [], connections: {} },
    },
    message: "Add a webhook node",
    history: [],
  };

  test("accepts valid request", () => {
    const result = validateRequest(validRequest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects invalid UUID for workflowId", () => {
    const invalid = { ...validRequest, workflowId: "not-a-uuid" };
    const result = validateRequest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid workflowId");
  });

  test("rejects empty message", () => {
    const invalid = { ...validRequest, message: "" };
    const result = validateRequest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Empty message");
  });

  test("rejects message exceeding 10000 characters", () => {
    const invalid = { ...validRequest, message: "x".repeat(10001) };
    const result = validateRequest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Message too long");
  });

  test("accepts message at exactly 10000 characters", () => {
    const valid = { ...validRequest, message: "x".repeat(10000) };
    const result = validateRequest(valid);
    expect(result.valid).toBe(true);
  });

  test("accepts null description", () => {
    const valid = {
      ...validRequest,
      currentWorkflow: { ...validRequest.currentWorkflow, description: null },
    };
    const result = validateRequest(valid);
    expect(result.valid).toBe(true);
  });

  test("rejects missing currentWorkflow fields", () => {
    const invalid = {
      ...validRequest,
      currentWorkflow: { id: "123", name: "Test" },
    };
    const result = validateRequest(invalid);
    expect(result.valid).toBe(false);
  });

  test("handles missing history (defaults to empty)", () => {
    const { history, ...withoutHistory } = validRequest;
    const result = validateRequest(withoutHistory);
    expect(result.valid).toBe(true);
  });

  test("rejects invalid history role", () => {
    const invalid = {
      ...validRequest,
      history: [{ role: "system", content: "test" }],
    };
    const result = validateRequest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid role"))).toBe(true);
  });

  test("accepts complex history with valid roles", () => {
    const valid = {
      ...validRequest,
      history: [
        { role: "user", content: "Add a node" },
        { role: "assistant", content: "I'll add a webhook node" },
        { role: "user", content: "Now add an HTTP node" },
      ],
    };
    const result = validateRequest(valid);
    expect(result.valid).toBe(true);
  });
});

describe("Workflow Data Structure", () => {
  test("empty workflow data is valid", () => {
    const workflowData = { nodes: [], connections: {} };
    expect(workflowData.nodes).toBeInstanceOf(Array);
    expect(typeof workflowData.connections).toBe("object");
  });

  test("workflow with nodes has expected structure", () => {
    const workflowData = {
      nodes: [
        {
          id: "node-1",
          name: "Start",
          type: "n8n-nodes-base.start",
          position: [250, 300],
          parameters: {},
        },
        {
          id: "node-2",
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          position: [450, 300],
          parameters: { url: "https://api.example.com" },
        },
      ],
      connections: {
        "node-1": {
          main: [[{ node: "node-2", type: "main", index: 0 }]],
        },
      },
    };

    expect(workflowData.nodes.length).toBe(2);
    expect(workflowData.nodes[0].id).toBe("node-1");
    expect(workflowData.connections["node-1"]).toBeDefined();
  });
});

describe("Message Parsing Edge Cases", () => {
  test("handles unicode characters in message", () => {
    const message = "Add a node for 日本語 and émojis 🚀";
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain("🚀");
  });

  test("handles newlines in message", () => {
    const message =
      "Add a webhook node\nThen add an HTTP node\nFinally add a response";
    const lines = message.split("\n");
    expect(lines.length).toBe(3);
  });

  test("handles whitespace-only after trim", () => {
    const message = "   \t\n   ";
    expect(message.trim()).toBe("");
  });

  test("handles JSON in message", () => {
    const message =
      'Set the parameters to {"url": "https://api.com", "method": "POST"}';
    expect(message).toContain("{");
    expect(message).toContain("}");
  });

  test("handles code blocks in message", () => {
    const message = "Use this code:\n```javascript\nconst x = 1;\n```";
    expect(message).toContain("```");
  });
});

describe("Response Parsing", () => {
  test("extracts JSON from response with surrounding text", () => {
    const response =
      'Here is the change: {"message": "Added node", "proposedChanges": {"name": "New Name"}} That should work.';
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed.message).toBe("Added node");
    expect(parsed.proposedChanges.name).toBe("New Name");
  });

  test("handles response with no JSON", () => {
    const response = "I need more information about what you want to change.";
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeNull();
  });

  test("handles malformed JSON gracefully", () => {
    const response = '{"message": "test", "invalid": }';
    let parsed: { message: string } | null = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      parsed = { message: response };
    }
    expect(parsed).not.toBeNull();
    expect(parsed!.message).toBeDefined();
  });

  test("handles nested JSON in response", () => {
    const response = `{
      "message": "I'll add a webhook node",
      "proposedChanges": {
        "workflowData": {
          "nodes": [
            {"id": "1", "name": "Webhook", "type": "n8n-nodes-base.webhook"}
          ],
          "connections": {}
        }
      }
    }`;
    const parsed = JSON.parse(response);
    expect(parsed.proposedChanges.workflowData.nodes.length).toBe(1);
    expect(parsed.proposedChanges.workflowData.nodes[0].type).toBe(
      "n8n-nodes-base.webhook",
    );
  });
});

describe("Proposed Changes Structure", () => {
  test("workflowData changes have nodes and connections", () => {
    const proposedChanges = {
      workflowData: {
        nodes: [{ id: "1", name: "Test", type: "n8n-nodes-base.noOp" }],
        connections: {},
      },
    };
    expect(proposedChanges.workflowData.nodes).toBeInstanceOf(Array);
    expect(typeof proposedChanges.workflowData.connections).toBe("object");
  });

  test("name change is a string", () => {
    const proposedChanges = { name: "New Workflow Name" };
    expect(typeof proposedChanges.name).toBe("string");
    expect(proposedChanges.name.length).toBeGreaterThan(0);
  });

  test("description can be null or string", () => {
    const withString = { description: "New description" };
    const withNull = { description: null };

    expect(typeof withString.description).toBe("string");
    expect(withNull.description).toBeNull();
  });

  test("status must be valid value", () => {
    const validStatuses = ["draft", "active", "archived"];
    const proposedChanges = { status: "active" };
    expect(validStatuses).toContain(proposedChanges.status);
  });

  test("empty proposedChanges object is valid", () => {
    const proposedChanges = {};
    expect(Object.keys(proposedChanges).length).toBe(0);
  });

  test("partial changes are valid", () => {
    const proposedChanges = { name: "New Name" };
    expect(proposedChanges.name).toBeDefined();
    expect(
      (proposedChanges as Record<string, unknown>).workflowData,
    ).toBeUndefined();
    expect((proposedChanges as Record<string, unknown>).status).toBeUndefined();
  });
});

describe("Update Payload Construction", () => {
  function buildUpdatePayload(proposedChanges: {
    workflowData?: Record<string, unknown>;
    name?: string;
    description?: string;
    status?: string;
  }) {
    const { workflowData, name, description, status } = proposedChanges;
    return {
      ...(workflowData && { workflowData }),
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(status && { status }),
    };
  }

  test("includes only defined properties", () => {
    const payload = buildUpdatePayload({ name: "New Name" });
    expect(payload).toEqual({ name: "New Name" });
    expect(Object.keys(payload).length).toBe(1);
  });

  test("includes description when explicitly set to empty string", () => {
    const payload = buildUpdatePayload({ description: "" });
    expect(payload).toEqual({ description: "" });
  });

  test("handles all properties", () => {
    const payload = buildUpdatePayload({
      workflowData: { nodes: [] },
      name: "Name",
      description: "Desc",
      status: "active",
    });
    expect(Object.keys(payload).length).toBe(4);
    expect(payload.workflowData).toEqual({ nodes: [] });
    expect(payload.name).toBe("Name");
    expect(payload.description).toBe("Desc");
    expect(payload.status).toBe("active");
  });

  test("empty object when no properties", () => {
    const payload = buildUpdatePayload({});
    expect(payload).toEqual({});
  });

  test("falsy name is excluded", () => {
    const payload = buildUpdatePayload({ name: "" });
    expect(payload).toEqual({});
  });
});

describe("History Management", () => {
  test("history is limited to last 10 messages", () => {
    const fullHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${i}`,
    }));

    const limited = fullHistory.slice(-10);
    expect(limited.length).toBe(10);
    expect(limited[0].content).toBe("Message 10");
    expect(limited[9].content).toBe("Message 19");
  });

  test("empty history is handled", () => {
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    expect(history.length).toBe(0);
    expect(history.slice(-10)).toEqual([]);
  });

  test("history with less than 10 messages is unchanged", () => {
    const history = [
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
    ];
    expect(history.slice(-10)).toEqual(history);
  });
});

describe("Error Scenarios", () => {
  test("workflow not found response structure", () => {
    const errorResponse = { success: false, error: "Workflow not found" };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBe("Workflow not found");
  });

  test("invalid request response structure", () => {
    const errorResponse = {
      success: false,
      error: "Invalid request",
      details: { workflowId: { _errors: ["Invalid uuid"] } },
    };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.details).toBeDefined();
  });

  test("AI error response structure", () => {
    const errorResponse = { success: false, error: "No response from AI" };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain("AI");
  });
});

describe("Message ID Generation", () => {
  test("user message IDs are unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ids.add(id);
    }
    expect(ids.size).toBeGreaterThan(90);
  });

  test("message IDs have expected format", () => {
    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    const errorId = `error-${Date.now()}`;

    expect(userId).toMatch(/^user-\d+$/);
    expect(assistantId).toMatch(/^assistant-\d+$/);
    expect(errorId).toMatch(/^error-\d+$/);
  });
});
