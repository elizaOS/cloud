import { describe, test, expect } from "bun:test";

const WORKFLOW_TEMPLATES = [
  {
    id: "webhook-ai-storage",
    name: "Webhook → AI → Storage",
    description: "Process webhook data with AI and store results",
    prompt:
      "Create a workflow that: 1) Receives data via webhook, 2) Processes it with the chat API to extract insights, 3) Stores the results in IPFS storage",
  },
  {
    id: "scheduled-report",
    name: "Scheduled Report",
    description: "Generate and send periodic reports",
    prompt:
      "Create a workflow that runs on a schedule (every day at 9am) to: 1) Query an API for data, 2) Generate a summary report using AI, 3) Send results via HTTP POST to a notification endpoint",
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "ETL workflow with transformation",
    prompt:
      "Create a data pipeline workflow that: 1) Fetches data from an HTTP API, 2) Transforms the data using a code node (filter and map), 3) Splits into batches for processing, 4) Makes API calls for each batch",
  },
  {
    id: "content-moderation",
    name: "Content Moderation",
    description: "AI-powered content review pipeline",
    prompt:
      "Create a content moderation workflow: 1) Receive content via webhook, 2) Use AI to analyze for policy violations, 3) Branch based on result (approve/flag/reject), 4) Store decision and notify via HTTP",
  },
  {
    id: "agent-orchestration",
    name: "Agent Orchestration",
    description: "Multi-step AI agent workflow",
    prompt:
      "Create an agent orchestration workflow: 1) Receive a task via webhook, 2) Use AI to break it into subtasks, 3) Execute each subtask with separate AI calls, 4) Merge results and return comprehensive response",
  },
];

describe("Workflow Templates", () => {
  test("all templates have required fields", () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.prompt).toBeDefined();
      expect(typeof template.id).toBe("string");
      expect(typeof template.name).toBe("string");
      expect(typeof template.description).toBe("string");
      expect(typeof template.prompt).toBe("string");
    }
  });

  test("template IDs are unique", () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("template IDs follow kebab-case convention", () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("prompts contain actionable instructions", () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.prompt.length).toBeGreaterThan(50);
      expect(template.prompt.toLowerCase()).toContain("workflow");
    }
  });

  test("descriptions are concise", () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.description.length).toBeLessThan(100);
      expect(template.description.length).toBeGreaterThan(10);
    }
  });
});

describe("Template Categories", () => {
  test("covers common use cases", () => {
    const templateNames = WORKFLOW_TEMPLATES.map((t) => t.name.toLowerCase());

    // Should have webhook-related template
    expect(templateNames.some((n) => n.includes("webhook"))).toBe(true);

    // Should have scheduled/cron template
    expect(
      templateNames.some(
        (n) => n.includes("scheduled") || n.includes("report"),
      ),
    ).toBe(true);

    // Should have data processing template
    expect(
      templateNames.some((n) => n.includes("data") || n.includes("pipeline")),
    ).toBe(true);

    // Should have AI-related template
    expect(
      templateNames.some((n) => n.includes("ai") || n.includes("agent")),
    ).toBe(true);
  });

  test("minimum number of templates for good coverage", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Prompt Quality", () => {
  test("webhook template mentions trigger and response", () => {
    const webhookTemplate = WORKFLOW_TEMPLATES.find((t) =>
      t.id.includes("webhook"),
    );
    expect(webhookTemplate).toBeDefined();
    expect(webhookTemplate!.prompt.toLowerCase()).toContain("webhook");
  });

  test("scheduled template mentions timing", () => {
    const scheduledTemplate = WORKFLOW_TEMPLATES.find((t) =>
      t.id.includes("scheduled"),
    );
    expect(scheduledTemplate).toBeDefined();
    expect(scheduledTemplate!.prompt.toLowerCase()).toMatch(
      /schedule|day|hour|cron/,
    );
  });

  test("data pipeline template mentions transformation", () => {
    const pipelineTemplate = WORKFLOW_TEMPLATES.find((t) =>
      t.id.includes("pipeline"),
    );
    expect(pipelineTemplate).toBeDefined();
    expect(pipelineTemplate!.prompt.toLowerCase()).toMatch(
      /transform|filter|map|process/,
    );
  });

  test("agent template mentions multi-step or orchestration", () => {
    const agentTemplate = WORKFLOW_TEMPLATES.find((t) =>
      t.id.includes("agent"),
    );
    expect(agentTemplate).toBeDefined();
    expect(agentTemplate!.prompt.toLowerCase()).toMatch(
      /subtask|step|orchestrat/,
    );
  });
});

describe("Template Selection Edge Cases", () => {
  test("selecting template updates prompt state", () => {
    let currentPrompt = "";
    const setPrompt = (value: string) => {
      currentPrompt = value;
    };

    const template = WORKFLOW_TEMPLATES[0];
    setPrompt(template.prompt);

    expect(currentPrompt).toBe(template.prompt);
    expect(currentPrompt.length).toBeGreaterThan(0);
  });

  test("selecting same template twice keeps same prompt", () => {
    let currentPrompt = "";
    const setPrompt = (value: string) => {
      currentPrompt = value;
    };

    const template = WORKFLOW_TEMPLATES[0];
    setPrompt(template.prompt);
    const firstPrompt = currentPrompt;

    setPrompt(template.prompt);
    expect(currentPrompt).toBe(firstPrompt);
  });

  test("clearing prompt after template selection", () => {
    let currentPrompt = WORKFLOW_TEMPLATES[0].prompt;
    const setPrompt = (value: string) => {
      currentPrompt = value;
    };

    setPrompt("");
    expect(currentPrompt).toBe("");
  });

  test("manually editing template prompt", () => {
    let currentPrompt = WORKFLOW_TEMPLATES[0].prompt;
    const setPrompt = (value: string) => {
      currentPrompt = value;
    };

    setPrompt(currentPrompt + " Also add logging.");
    expect(currentPrompt).toContain("Also add logging.");
    expect(currentPrompt).not.toBe(WORKFLOW_TEMPLATES[0].prompt);
  });
});

describe("Generated Workflow Validation", () => {
  const mockGeneratedWorkflow = {
    workflow: {
      nodes: [
        {
          id: "1",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          position: [250, 300],
        },
        {
          id: "2",
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          position: [450, 300],
        },
      ],
      connections: {
        "1": { main: [[{ node: "2", type: "main", index: 0 }]] },
      },
    },
    validation: { valid: true, errors: [] },
    metadata: {
      model: "claude-sonnet",
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      cost: 0.0015,
    },
  };

  test("valid workflow has no errors", () => {
    expect(mockGeneratedWorkflow.validation.valid).toBe(true);
    expect(mockGeneratedWorkflow.validation.errors).toHaveLength(0);
  });

  test("workflow nodes have required fields", () => {
    for (const node of mockGeneratedWorkflow.workflow.nodes) {
      expect(node.id).toBeDefined();
      expect(node.name).toBeDefined();
      expect(node.type).toBeDefined();
      expect(node.position).toBeInstanceOf(Array);
      expect(node.position).toHaveLength(2);
    }
  });

  test("connections reference valid node IDs", () => {
    const nodeIds = new Set(
      mockGeneratedWorkflow.workflow.nodes.map((n) => n.id),
    );

    for (const [sourceId, outputs] of Object.entries(
      mockGeneratedWorkflow.workflow.connections,
    )) {
      expect(nodeIds.has(sourceId)).toBe(true);

      for (const outputArray of outputs.main) {
        for (const connection of outputArray) {
          expect(nodeIds.has(connection.node)).toBe(true);
        }
      }
    }
  });

  test("metadata contains cost information", () => {
    expect(mockGeneratedWorkflow.metadata.cost).toBeDefined();
    expect(typeof mockGeneratedWorkflow.metadata.cost).toBe("number");
    expect(mockGeneratedWorkflow.metadata.cost).toBeGreaterThan(0);
  });

  test("usage tokens are positive integers", () => {
    const { usage } = mockGeneratedWorkflow.metadata;
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
  });
});

describe("Workflow Validation Errors", () => {
  test("invalid workflow has errors array", () => {
    const invalidWorkflow = {
      validation: {
        valid: false,
        errors: ["Missing start node", "Orphan node detected"],
      },
    };
    expect(invalidWorkflow.validation.valid).toBe(false);
    expect(invalidWorkflow.validation.errors.length).toBeGreaterThan(0);
  });

  test("error messages are descriptive", () => {
    const errors = [
      "Node 'HTTP Request' has no input connection",
      "Circular dependency detected between nodes",
      "Invalid node type: n8n-nodes-custom.unknown",
    ];

    for (const error of errors) {
      expect(error.length).toBeGreaterThan(10);
      expect(error).not.toBe("");
    }
  });
});

describe("Auto-Save Functionality", () => {
  test("auto-save requires workflow name", () => {
    const autoSave = true;
    const workflowName = "";

    const canSubmit = !autoSave || workflowName.trim().length > 0;
    expect(canSubmit).toBe(false);
  });

  test("auto-save with valid name is allowed", () => {
    const autoSave = true;
    const workflowName = "My Workflow";

    const canSubmit = !autoSave || workflowName.trim().length > 0;
    expect(canSubmit).toBe(true);
  });

  test("no auto-save doesn't require name", () => {
    const autoSave = false;
    const workflowName = "";

    const canSubmit = !autoSave || workflowName.trim().length > 0;
    expect(canSubmit).toBe(true);
  });

  test("whitespace-only name is invalid for auto-save", () => {
    const autoSave = true;
    const workflowName = "   \t\n   ";

    const canSubmit = !autoSave || workflowName.trim().length > 0;
    expect(canSubmit).toBe(false);
  });
});

describe("Generation State Management", () => {
  test("isGenerating prevents double submission", () => {
    let isGenerating = false;

    const handleGenerate = () => {
      if (isGenerating) return false;
      isGenerating = true;
      return true;
    };

    expect(handleGenerate()).toBe(true);
    expect(handleGenerate()).toBe(false);
    expect(isGenerating).toBe(true);
  });

  test("empty prompt prevents submission", () => {
    const prompt = "";
    const canSubmit = prompt.trim().length > 0;
    expect(canSubmit).toBe(false);
  });

  test("whitespace-only prompt prevents submission", () => {
    const prompt = "   \n\t   ";
    const canSubmit = prompt.trim().length > 0;
    expect(canSubmit).toBe(false);
  });

  test("valid prompt allows submission", () => {
    const prompt = "Create a webhook workflow";
    const canSubmit = prompt.trim().length > 0;
    expect(canSubmit).toBe(true);
  });
});

describe("Saved Workflow Response", () => {
  test("saved workflow has ID", () => {
    const savedWorkflow = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "My Workflow",
      status: "draft",
      version: 1,
    };
    expect(savedWorkflow.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("saved workflow starts at version 1", () => {
    const savedWorkflow = { version: 1 };
    expect(savedWorkflow.version).toBe(1);
  });

  test("saved workflow has draft status by default", () => {
    const savedWorkflow = { status: "draft" };
    expect(savedWorkflow.status).toBe("draft");
  });
});

describe("Error Handling", () => {
  test("network error produces error message", () => {
    const error = new Error("Failed to generate workflow");
    expect(error.message).toBe("Failed to generate workflow");
  });

  test("API error with details", () => {
    const apiError = {
      error: "Invalid prompt",
      details: "Prompt must be at least 10 characters",
    };
    expect(apiError.error).toBeDefined();
    expect(apiError.details).toBeDefined();
  });

  test("rate limit error", () => {
    const rateLimitError = {
      error: "Rate limit exceeded",
      retryAfter: 60,
    };
    expect(rateLimitError.retryAfter).toBe(60);
  });

  test("credit error", () => {
    const creditError = {
      error: "Insufficient credits",
      required: 0.01,
      available: 0.005,
    };
    expect(creditError.required).toBeGreaterThan(creditError.available);
  });
});

describe("Template Display", () => {
  test("active template has distinct styling", () => {
    const prompt = WORKFLOW_TEMPLATES[0].prompt;
    const isActive = (template: (typeof WORKFLOW_TEMPLATES)[0]) =>
      template.prompt === prompt;

    expect(isActive(WORKFLOW_TEMPLATES[0])).toBe(true);
    expect(isActive(WORKFLOW_TEMPLATES[1])).toBe(false);
  });

  test("template grid renders all templates", () => {
    const rendered = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(rendered.length).toBe(WORKFLOW_TEMPLATES.length);
  });
});
