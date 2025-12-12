import { describe, it, expect, beforeEach, mock } from "bun:test";

const callLog: Array<{ method: string; args: unknown[] }> = [];

const mockGetDecrypted = mock(async (params: { organizationId: string; projectId?: string }) => {
  callLog.push({ method: "getDecrypted", args: [params] });
  
  // Simulate org vs project secrets
  if (!params.projectId) {
    return { ORG_KEY: "org-value", SHARED: "org-shared" };
  }
  return { PROJECT_KEY: "project-value", SHARED: "project-shared" };
});

let isConfiguredValue = true;

mock.module("@/lib/services/secrets/secrets", () => ({
  secretsService: {
    get isConfigured() { return isConfiguredValue; },
    getDecrypted: mockGetDecrypted,
  },
}));

import {
  loadSecrets,
  loadAgentSecrets,
  loadMcpSecrets,
  loadWorkflowSecrets,
  loadContainerSecrets,
  loadSandboxSecrets,
  loadOrgSecrets,
  isSecretsConfigured,
  assertSecretsConfigured,
  SecretsNotConfiguredError,
} from "@/lib/services/secrets/helpers";

const resetMocks = () => {
  mockGetDecrypted.mockClear();
  callLog.length = 0;
  isConfiguredValue = true;
};

describe("Secrets Helpers - Boundary Conditions", () => {
  beforeEach(resetMocks);

  describe("Empty and null-like values", () => {
    it("handles org secrets returning empty object", async () => {
      mockGetDecrypted.mockResolvedValueOnce({});
      const result = await loadSecrets({ organizationId: "org-1" });
      expect(result).toEqual({});
    });

    it("handles project secrets returning empty object (org still merges)", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ ORG_KEY: "value" })
        .mockResolvedValueOnce({});
      
      const result = await loadSecrets({ organizationId: "org-1", projectId: "proj-1" });
      expect(result).toEqual({ ORG_KEY: "value" });
    });

    it("handles both org and project secrets returning empty", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      
      const result = await loadSecrets({ organizationId: "org-1", projectId: "proj-1" });
      expect(result).toEqual({});
    });

    it("preserves secrets with empty string values", async () => {
      mockGetDecrypted.mockResolvedValueOnce({ EMPTY_VALUE: "", NORMAL: "value" });
      const result = await loadSecrets({ organizationId: "org-1" });
      expect(result).toEqual({ EMPTY_VALUE: "", NORMAL: "value" });
      expect(result.EMPTY_VALUE).toBe("");
    });
  });

  describe("Secret name edge cases", () => {
    it("handles secret names with special characters", async () => {
      mockGetDecrypted.mockResolvedValueOnce({
        "KEY_WITH_NUMBERS_123": "v1",
        "SNAKE_CASE_KEY": "v2",
        "WITH__DOUBLE__UNDERSCORE": "v3",
      });
      
      const result = await loadSecrets({ organizationId: "org-1" });
      expect(Object.keys(result)).toHaveLength(3);
      expect(result["KEY_WITH_NUMBERS_123"]).toBe("v1");
    });

    it("handles many secrets (100)", async () => {
      const manySecrets: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        manySecrets[`SECRET_${i.toString().padStart(3, "0")}`] = `value_${i}`;
      }
      mockGetDecrypted.mockResolvedValueOnce(manySecrets);
      
      const result = await loadSecrets({ organizationId: "org-1" });
      expect(Object.keys(result)).toHaveLength(100);
      expect(result.SECRET_099).toBe("value_99");
    });
  });

  describe("Project priority override", () => {
    it("project secrets completely override org secrets with same name", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ SHARED: "org-value", ORG_ONLY: "org" })
        .mockResolvedValueOnce({ SHARED: "project-value", PROJECT_ONLY: "project" });
      
      const result = await loadSecrets({ organizationId: "org-1", projectId: "proj-1" });
      
      expect(result).toEqual({
        SHARED: "project-value",  // Project wins
        ORG_ONLY: "org",
        PROJECT_ONLY: "project",
      });
    });

    it("project can override with empty string", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ KEY: "org-value" })
        .mockResolvedValueOnce({ KEY: "" });
      
      const result = await loadSecrets({ organizationId: "org-1", projectId: "proj-1" });
      expect(result.KEY).toBe("");
    });
  });
});

describe("Secrets Helpers - Error Handling", () => {
  beforeEach(resetMocks);

  // Note: Service not configured tests are in secrets-helpers.test.ts with vitest
  // The bun mock.module doesn't support dynamic isConfigured changes well

  describe("SecretsNotConfiguredError class", () => {
    it("can be instantiated and thrown", () => {
      const error = new SecretsNotConfiguredError();
      expect(error.name).toBe("SecretsNotConfiguredError");
      expect(error.message).toContain("SECRETS_MASTER_KEY");
    });

    it("is catchable as Error", () => {
      let caught: Error | null = null;
      try {
        throw new SecretsNotConfiguredError();
      } catch (e) {
        if (e instanceof Error) caught = e;
      }
      expect(caught).not.toBeNull();
      expect(caught?.name).toBe("SecretsNotConfiguredError");
    });
  });

  describe("Error propagation from service", () => {
    it("propagates getDecrypted errors without modification", async () => {
      const originalError = new Error("Database connection failed");
      mockGetDecrypted.mockRejectedValueOnce(originalError);
      
      await expect(loadSecrets({ organizationId: "org-1" }))
        .rejects.toThrow("Database connection failed");
    });

    it("propagates errors from project secrets fetch", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ ORG: "value" })
        .mockRejectedValueOnce(new Error("Project fetch failed"));
      
      await expect(loadSecrets({ organizationId: "org-1", projectId: "proj-1" }))
        .rejects.toThrow("Project fetch failed");
    });

    it("org secrets are not lost if project fetch fails", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ ORG: "value" })
        .mockRejectedValueOnce(new Error("fail"));
      
      // The error should propagate, not return partial results
      await expect(loadSecrets({ organizationId: "org-1", projectId: "proj-1" }))
        .rejects.toThrow("fail");
    });
  });
});

describe("Secrets Helpers - Concurrent Operations", () => {
  beforeEach(resetMocks);

  describe("Parallel calls", () => {
    it("handles 20 parallel loadSecrets calls", async () => {
      // Each call should work independently
      mockGetDecrypted.mockImplementation(async (params) => {
        await new Promise(r => setTimeout(r, Math.random() * 10)); // Random delay
        return { KEY: `value-for-${params.organizationId}` };
      });

      const calls = Array(20).fill(null).map((_, i) => 
        loadSecrets({ organizationId: `org-${i}` })
      );

      const results = await Promise.all(calls);
      
      expect(results).toHaveLength(20);
      results.forEach((r, i) => {
        expect(r.KEY).toBe(`value-for-org-${i}`);
      });
    });

    it("handles mixed helper calls in parallel", async () => {
      mockGetDecrypted.mockImplementation(async (params) => {
        return { KEY: params.projectId ? `project-${params.projectId}` : "org" };
      });

      const calls = [
        loadAgentSecrets({ organizationId: "org-1", characterId: "char-1" }),
        loadMcpSecrets({ organizationId: "org-1", mcpId: "mcp-1" }),
        loadWorkflowSecrets({ organizationId: "org-1", workflowId: "wf-1" }),
        loadContainerSecrets({ organizationId: "org-1", containerId: "ctr-1" }),
        loadSandboxSecrets({ organizationId: "org-1", appId: "app-1" }),
      ];

      const results = await Promise.all(calls);
      expect(results).toHaveLength(5);
    });

    it("parallel calls with interleaved failures", async () => {
      let callCount = 0;
      mockGetDecrypted.mockImplementation(async () => {
        callCount++;
        if (callCount % 3 === 0) {
          throw new Error(`Call ${callCount} failed`);
        }
        return { KEY: "value" };
      });

      const calls = Array(6).fill(null).map(() => 
        loadSecrets({ organizationId: "org-1" }).catch(e => e)
      );

      const results = await Promise.all(calls);
      const errors = results.filter(r => r instanceof Error);
      const successes = results.filter(r => !(r instanceof Error));
      
      expect(errors.length).toBeGreaterThan(0);
      expect(successes.length).toBeGreaterThan(0);
    });
  });
});

describe("Secrets Helpers - Data Structure Verification", () => {
  beforeEach(resetMocks);

  describe("Call verification - projectType is passed correctly", () => {
    it("loadAgentSecrets passes projectType: character", async () => {
      mockGetDecrypted.mockResolvedValue({});
      
      await loadAgentSecrets({ organizationId: "org-1", characterId: "char-1" });
      
      expect(mockGetDecrypted).toHaveBeenCalledTimes(2);
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(1, { 
        organizationId: "org-1",
        environment: undefined,
      });
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(2, { 
        organizationId: "org-1", 
        projectId: "char-1",
        projectType: "character",
        environment: undefined,
      });
    });

    it("loadMcpSecrets passes projectType: mcp", async () => {
      mockGetDecrypted.mockResolvedValue({});
      
      await loadMcpSecrets({ organizationId: "org-1", mcpId: "mcp-1" });
      
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(2, { 
        organizationId: "org-1", 
        projectId: "mcp-1",
        projectType: "mcp",
        environment: undefined,
      });
    });

    it("loadWorkflowSecrets passes projectType: workflow", async () => {
      mockGetDecrypted.mockResolvedValue({});
      
      await loadWorkflowSecrets({ organizationId: "org-1", workflowId: "wf-1" });
      
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(2, { 
        organizationId: "org-1", 
        projectId: "wf-1",
        projectType: "workflow",
        environment: undefined,
      });
    });

    it("loadContainerSecrets passes projectType: container", async () => {
      mockGetDecrypted.mockResolvedValue({});
      
      await loadContainerSecrets({ organizationId: "org-1", containerId: "ctr-1" });
      
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(2, { 
        organizationId: "org-1", 
        projectId: "ctr-1",
        projectType: "container",
        environment: undefined,
      });
    });

    it("loadSandboxSecrets passes projectType: app", async () => {
      mockGetDecrypted.mockResolvedValue({});
      
      await loadSandboxSecrets({ organizationId: "org-1", appId: "app-1" });
      
      expect(mockGetDecrypted).toHaveBeenNthCalledWith(2, { 
        organizationId: "org-1", 
        projectId: "app-1",
        projectType: "app",
        environment: undefined,
      });
    });
  });

  describe("Optional project ID handling", () => {
    it("loadContainerSecrets without containerId only fetches org", async () => {
      mockGetDecrypted.mockResolvedValue({ ORG: "value" });
      
      const result = await loadContainerSecrets({ organizationId: "org-1" });
      
      expect(mockGetDecrypted).toHaveBeenCalledTimes(1);
      expect(mockGetDecrypted).toHaveBeenCalledWith({ organizationId: "org-1" });
      expect(result).toEqual({ ORG: "value" });
    });

    it("loadSandboxSecrets without appId only fetches org", async () => {
      mockGetDecrypted.mockResolvedValue({ ORG: "value" });
      
      const result = await loadSandboxSecrets({ organizationId: "org-1" });
      
      expect(mockGetDecrypted).toHaveBeenCalledTimes(1);
      expect(mockGetDecrypted).toHaveBeenCalledWith({ organizationId: "org-1" });
    });

    it("loadContainerSecrets with containerId fetches both", async () => {
      mockGetDecrypted
        .mockResolvedValueOnce({ ORG: "org" })
        .mockResolvedValueOnce({ CTR: "container" });
      
      const result = await loadContainerSecrets({ 
        organizationId: "org-1", 
        containerId: "ctr-1" 
      });
      
      expect(mockGetDecrypted).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ORG: "org", CTR: "container" });
    });
  });
});

describe("Secrets Helpers - Return Value Verification", () => {
  beforeEach(resetMocks);

  it("returns exactly the merged object structure", async () => {
    mockGetDecrypted
      .mockResolvedValueOnce({ A: "1", B: "2" })
      .mockResolvedValueOnce({ C: "3", D: "4" });
    
    const result = await loadSecrets({ organizationId: "o", projectId: "p" });
    
    expect(Object.keys(result).sort()).toEqual(["A", "B", "C", "D"]);
    expect(result.A).toBe("1");
    expect(result.B).toBe("2");
    expect(result.C).toBe("3");
    expect(result.D).toBe("4");
  });

  it("result is a plain object with expected type", async () => {
    mockGetDecrypted.mockResolvedValueOnce({ KEY: "value" });
    
    const result = await loadSecrets({ organizationId: "org-1" });
    
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });

  it("result has correct key-value types", async () => {
    mockGetDecrypted.mockResolvedValueOnce({ 
      STRING_KEY: "string-value",
      EMPTY: "",
      WITH_NUMBERS: "123",
    });
    
    const result = await loadSecrets({ organizationId: "org-1" });
    
    expect(typeof result.STRING_KEY).toBe("string");
    expect(typeof result.EMPTY).toBe("string");
    expect(typeof result.WITH_NUMBERS).toBe("string");
  });
});

describe("SecretsNotConfiguredError", () => {
  it("is instanceof Error", () => {
    const error = new SecretsNotConfiguredError();
    expect(error instanceof Error).toBe(true);
    expect(error instanceof SecretsNotConfiguredError).toBe(true);
  });

  it("has correct error properties", () => {
    const error = new SecretsNotConfiguredError();
    expect(error.name).toBe("SecretsNotConfiguredError");
    expect(error.message).toContain("SECRETS_MASTER_KEY");
    expect(error.message).toContain("AWS KMS");
    expect(error.stack).toBeDefined();
  });

  it("can be caught as Error", async () => {
    isConfiguredValue = false;
    
    let caughtError: Error | null = null;
    try {
      await loadSecrets({ organizationId: "org-1" });
    } catch (e) {
      if (e instanceof Error) {
        caughtError = e;
      }
    }
    
    expect(caughtError).not.toBeNull();
    expect(caughtError?.name).toBe("SecretsNotConfiguredError");
  });
});

describe("isSecretsConfigured", () => {
  beforeEach(resetMocks);

  it("returns boolean true when configured", () => {
    isConfiguredValue = true;
    const result = isSecretsConfigured();
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  it("returns boolean false when not configured", () => {
    isConfiguredValue = false;
    const result = isSecretsConfigured();
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });

  it("can be used in conditional without throwing", () => {
    isConfiguredValue = false;
    
    let executed = false;
    if (isSecretsConfigured()) {
      executed = true;
    }
    
    expect(executed).toBe(false);
  });
});

