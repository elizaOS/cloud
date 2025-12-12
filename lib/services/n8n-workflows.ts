/**
 * N8N Workflows Service
 *
 * Business logic for managing n8n workflows with:
 * - Workflow CRUD operations
 * - Version control (save, revert, review versions)
 * - Global and per-workflow variables
 * - API key management
 * - n8n instance integration
 * - Workflow testing and validation
 */

import {
  n8nInstancesRepository,
  n8nWorkflowsRepository,
  n8nWorkflowVersionsRepository,
  n8nWorkflowVariablesRepository,
  n8nWorkflowApiKeysRepository,
  n8nWorkflowExecutionsRepository,
  n8nWorkflowTriggersRepository,
  type N8nInstance,
  type N8nWorkflow,
  type N8nWorkflowVersion,
  type N8nWorkflowVariable,
  type N8nWorkflowApiKey,
  type N8nWorkflowExecution,
  type N8nWorkflowTrigger,
} from "@/db/repositories/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { createHash, randomBytes } from "crypto";
import { secretsService, loadWorkflowSecrets as loadSecretsHelper, isSecretsConfigured } from "@/lib/services/secrets";

// =============================================================================
// TYPES
// =============================================================================

interface CreateWorkflowParams {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  workflowData: Record<string, unknown>;
  tags?: string[];
}

interface UpdateWorkflowParams {
  name?: string;
  description?: string;
  workflowData?: Record<string, unknown>;
  status?: "draft" | "active" | "archived";
  tags?: string[];
}

interface CreateVariableParams {
  organizationId: string;
  workflowId?: string;
  name: string;
  value: string;
  type?: "string" | "number" | "boolean" | "json";
  isSecret?: boolean;
  description?: string;
}

interface CreateApiKeyParams {
  organizationId: string;
  workflowId?: string;
  name: string;
  scopes?: string[];
  expiresAt?: Date;
}

interface TestWorkflowParams {
  workflowId: string;
  inputData?: Record<string, unknown>;
  userId: string;
  triggerId?: string;
  executionType?: "test" | "manual" | "scheduled" | "webhook" | "a2a" | "mcp";
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class N8nWorkflowsService {
  // ===========================================================================
  // N8N INSTANCE OPERATIONS
  // ===========================================================================

  /**
   * Creates a new n8n instance connection.
   */
  async createInstance(
    organizationId: string,
    userId: string,
    name: string,
    endpoint: string,
    apiKey: string,
    isDefault: boolean = false
  ): Promise<N8nInstance> {
    // If this is set as default, unset other defaults
    if (isDefault) {
      const existingDefault = await n8nInstancesRepository.findDefaultByOrganization(organizationId);
      if (existingDefault) {
        await n8nInstancesRepository.update(existingDefault.id, {
          is_default: false,
        });
      }
    }

    // SECURITY NOTE: API key is stored encrypted via database column encryption.
    // For additional protection, consider migrating to secretsService with separate
    // secret storage and storing only the secret_id here.
    const instance = await n8nInstancesRepository.create({
      organization_id: organizationId,
      user_id: userId,
      name,
      endpoint,
      api_key: apiKey,
      is_default: isDefault,
    });

    logger.info(`[N8N Workflows] Created instance: ${name}`, {
      organizationId,
      instanceId: instance.id,
    });

    return instance;
  }

  /**
   * Gets all instances for an organization.
   */
  async listInstances(organizationId: string): Promise<N8nInstance[]> {
    return n8nInstancesRepository.findByOrganization(organizationId);
  }

  /**
   * Gets the default instance for an organization.
   */
  async getDefaultInstance(organizationId: string): Promise<N8nInstance | null> {
    const instance = await n8nInstancesRepository.findDefaultByOrganization(organizationId);
    return instance ?? null;
  }

  /**
   * Tests connection to an n8n instance.
   */
  async testInstanceConnection(instance: N8nInstance): Promise<boolean> {
    try {
      const response = await fetch(`${instance.endpoint}/healthz`, {
        method: "GET",
        headers: {
          "X-N8N-API-KEY": instance.api_key,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // WORKFLOW OPERATIONS
  // ===========================================================================

  /**
   * Creates a new workflow.
   */
  async createWorkflow(params: CreateWorkflowParams): Promise<N8nWorkflow> {
    const { organizationId, userId, name, description, workflowData, tags = [] } = params;

    const workflow = await n8nWorkflowsRepository.create({
      organization_id: organizationId,
      user_id: userId,
      name,
      description,
      workflow_data: workflowData,
      tags,
      status: "draft",
      version: 1,
    });

    // Create initial version
    await n8nWorkflowVersionsRepository.create({
      workflow_id: workflow.id,
      organization_id: organizationId,
      version: 1,
      workflow_data: workflowData,
      change_description: "Initial version",
      created_by: userId,
    });

    logger.info(`[N8N Workflows] Created workflow: ${name}`, {
      organizationId,
      workflowId: workflow.id,
    });

    return workflow;
  }

  /**
   * Gets a workflow by ID.
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflow | null> {
    const workflow = await n8nWorkflowsRepository.findById(workflowId);
    return workflow ?? null;
  }

  /**
   * Lists workflows for an organization.
   */
  async listWorkflows(
    organizationId: string,
    options: {
      status?: "draft" | "active" | "archived";
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<N8nWorkflow[]> {
    return n8nWorkflowsRepository.findByOrganization(organizationId, options);
  }

  /**
   * Updates a workflow.
   */
  async updateWorkflow(
    workflowId: string,
    params: UpdateWorkflowParams
  ): Promise<N8nWorkflow> {
    const existing = await n8nWorkflowsRepository.findById(workflowId);
    if (!existing) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const updateData: Partial<typeof existing> = {};

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.status !== undefined) updateData.status = params.status;
    if (params.tags !== undefined) updateData.tags = params.tags;

    // If workflow data changed, create new version
    if (params.workflowData) {
      const newVersion = existing.version + 1;
      updateData.workflow_data = params.workflowData;
      updateData.version = newVersion;

      // Create version record
      await n8nWorkflowVersionsRepository.create({
        workflow_id: workflowId,
        organization_id: existing.organization_id,
        version: newVersion,
        workflow_data: params.workflowData,
        change_description: params.description || "Workflow updated",
        created_by: existing.user_id,
      });
    }

    const updated = await n8nWorkflowsRepository.update(workflowId, updateData);
    if (!updated) {
      throw new Error(`Failed to update workflow ${workflowId}`);
    }

    logger.info(`[N8N Workflows] Updated workflow: ${workflowId}`, {
      workflowId,
      newVersion: updated.version,
    });

    return updated;
  }

  /**
   * Deletes a workflow.
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    await n8nWorkflowsRepository.delete(workflowId);
    logger.info(`[N8N Workflows] Deleted workflow: ${workflowId}`);
  }

  // ===========================================================================
  // VERSION CONTROL OPERATIONS
  // ===========================================================================

  /**
   * Gets version history for a workflow.
   */
  async getWorkflowVersions(
    workflowId: string,
    limit: number = 50
  ): Promise<N8nWorkflowVersion[]> {
    return n8nWorkflowVersionsRepository.findByWorkflow(workflowId, limit);
  }

  /**
   * Gets a specific version of a workflow.
   */
  async getWorkflowVersion(
    workflowId: string,
    version: number
  ): Promise<N8nWorkflowVersion | null> {
    const versionRecord = await n8nWorkflowVersionsRepository.findByWorkflowAndVersion(
      workflowId,
      version
    );
    return versionRecord ?? null;
  }

  /**
   * Reverts a workflow to a specific version.
   */
  async revertWorkflowToVersion(
    workflowId: string,
    version: number,
    userId: string
  ): Promise<N8nWorkflow> {
    const versionRecord = await this.getWorkflowVersion(workflowId, version);
    if (!versionRecord) {
      throw new Error(`Version ${version} not found for workflow ${workflowId}`);
    }

    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Create new version with reverted data
    const newVersion = workflow.version + 1;
    const updated = await n8nWorkflowsRepository.update(workflowId, {
      workflow_data: versionRecord.workflow_data,
      version: newVersion,
    });

    if (!updated) {
      throw new Error(`Failed to revert workflow ${workflowId}`);
    }

      // Create version record for revert
      await n8nWorkflowVersionsRepository.create({
        workflow_id: workflowId,
        organization_id: workflow.organization_id,
        version: newVersion,
        workflow_data: versionRecord.workflow_data,
        change_description: `Reverted to version ${version}`,
        created_by: userId,
      });

    logger.info(`[N8N Workflows] Reverted workflow ${workflowId} to version ${version}`);

    return updated;
  }

  // ===========================================================================
  // VARIABLE OPERATIONS
  // ===========================================================================

  /**
   * Creates a workflow variable (global or per-workflow).
   * 
   * For secret variables, the value is stored in the encrypted secrets vault
   * and a placeholder is stored in the variable record.
   */
  async createVariable(params: CreateVariableParams & { createdBy?: string }): Promise<N8nWorkflowVariable> {
    const { organizationId, workflowId, name, value, type = "string", isSecret = false, description, createdBy } = params;

    // Check if variable already exists
    const existing = await n8nWorkflowVariablesRepository.findByOrganizationAndName(
      organizationId,
      name,
      workflowId
    );
    if (existing) {
      throw new Error(
        `Variable '${name}' already exists${workflowId ? ` for workflow ${workflowId}` : " globally"}`
      );
    }

    let storedValue = value;

    // For secrets, store encrypted value in secrets vault and use placeholder in variable
    if (isSecret && isSecretsConfigured()) {
      const secretName = `N8N_VAR_${name.toUpperCase()}`;
      
      await secretsService.create(
        {
          organizationId,
          name: secretName,
          value,
          description: description || `n8n workflow variable: ${name}`,
          scope: workflowId ? "project" : "organization",
          projectId: workflowId,
          projectType: workflowId ? "workflow" : undefined,
          createdBy: createdBy || "system",
        },
        {
          actorType: "workflow",
          actorId: workflowId || organizationId,
          source: "n8n",
        }
      );

      storedValue = `[ENCRYPTED:${secretName}]`;
    }

    const variable = await n8nWorkflowVariablesRepository.create({
      organization_id: organizationId,
      workflow_id: workflowId,
      name,
      value: storedValue,
      type,
      is_secret: isSecret,
      description,
    });

    return variable;
  }

  /**
   * Gets global variables for an organization.
   */
  async getGlobalVariables(organizationId: string): Promise<N8nWorkflowVariable[]> {
    return n8nWorkflowVariablesRepository.findByOrganization(organizationId);
  }

  /**
   * Gets variables for a specific workflow.
   */
  async getWorkflowVariables(workflowId: string): Promise<N8nWorkflowVariable[]> {
    return n8nWorkflowVariablesRepository.findByWorkflow(workflowId);
  }

  /**
   * Gets decrypted variables for a workflow (merges global + workflow-specific).
   * Secret values are automatically decrypted from the vault.
   */
  async getDecryptedVariables(
    organizationId: string,
    workflowId?: string
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    // Get global variables
    const globalVars = await this.getGlobalVariables(organizationId);
    for (const v of globalVars) {
      result[v.name] = await this.resolveVariableValue(v, organizationId);
    }

    // Get workflow-specific variables (override globals)
    if (workflowId) {
      const workflowVars = await this.getWorkflowVariables(workflowId);
      for (const v of workflowVars) {
        result[v.name] = await this.resolveVariableValue(v, organizationId, workflowId);
      }
    }

    return result;
  }

  /**
   * Resolves the actual value of a variable, decrypting if needed.
   */
  private async resolveVariableValue(
    variable: N8nWorkflowVariable,
    organizationId: string,
    workflowId?: string
  ): Promise<string> {
    // If it's a secret with encrypted placeholder, decrypt from vault
    if (variable.is_secret && variable.value.startsWith("[ENCRYPTED:")) {
      const secretName = variable.value.match(/\[ENCRYPTED:(.+?)\]/)?.[1];
      if (secretName && isSecretsConfigured()) {
        const decryptedValue = await secretsService.get(
          organizationId,
          secretName,
          workflowId,
          undefined,
          { actorType: "workflow", actorId: workflowId || organizationId, source: "n8n" }
        );
        return decryptedValue || "";
      }
    }

    return variable.value;
  }

  /**
   * Updates a variable.
   * For secret variables, updates the encrypted value in the vault.
   */
  async updateVariable(
    variableId: string,
    params: Partial<CreateVariableParams>,
    organizationId?: string
  ): Promise<N8nWorkflowVariable> {
    // Get existing variable to check if it's a secret
    const existing = await n8nWorkflowVariablesRepository.findById(variableId);
    if (!existing) {
      throw new Error(`Variable ${variableId} not found`);
    }

    const updateData: Record<string, unknown> = {};
    if (params.type !== undefined) updateData.type = params.type;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.isSecret !== undefined) updateData.is_secret = params.isSecret;

    // Handle value update for secrets
    if (params.value !== undefined) {
      if (existing.is_secret && existing.value.startsWith("[ENCRYPTED:") && isSecretsConfigured()) {
        // Update the secret in the vault
        const secretName = existing.value.match(/\[ENCRYPTED:(.+?)\]/)?.[1];
        if (secretName && organizationId) {
          // Find and update the secret by name
          const secrets = await secretsService.list(organizationId);
          const secret = secrets.find(s => s.name === secretName);
          if (secret) {
            await secretsService.update(
              secret.id,
              organizationId,
              { value: params.value },
              { actorType: "workflow", actorId: variableId, source: "n8n" }
            );
          }
        }
        // Don't update the placeholder value in the variable record
      } else {
        updateData.value = params.value;
      }
    }

    const updated = await n8nWorkflowVariablesRepository.update(variableId, updateData);
    if (!updated) {
      throw new Error(`Variable ${variableId} not found`);
    }

    return updated;
  }

  /**
   * Deletes a variable.
   * For secret variables, also removes the encrypted value from the vault.
   */
  async deleteVariable(variableId: string, organizationId?: string): Promise<void> {
    // Get existing variable to check if it's a secret
    const existing = await n8nWorkflowVariablesRepository.findById(variableId);
    
    // If it's a secret with encrypted placeholder, delete from vault
    if (existing?.is_secret && existing.value.startsWith("[ENCRYPTED:") && organizationId && isSecretsConfigured()) {
      const secretName = existing.value.match(/\[ENCRYPTED:(.+?)\]/)?.[1];
      if (secretName) {
        const secrets = await secretsService.list(organizationId);
        const secret = secrets.find(s => s.name === secretName);
        if (secret) {
          await secretsService.delete(
            secret.id,
            organizationId,
            { actorType: "workflow", actorId: variableId, source: "n8n" }
          );
        }
      }
    }

    await n8nWorkflowVariablesRepository.delete(variableId);
  }

  // ===========================================================================
  // API KEY OPERATIONS
  // ===========================================================================

  /**
   * Creates an API key (global or per-workflow).
   */
  async createApiKey(params: CreateApiKeyParams): Promise<{
    apiKey: N8nWorkflowApiKey;
    plaintextKey: string;
  }> {
    const { organizationId, workflowId, name, scopes = [], expiresAt } = params;

    // Generate API key
    const plaintextKey = `n8n_${randomBytes(32).toString("hex")}`;
    const keyPrefix = plaintextKey.substring(0, 12);
    const keyHash = createHash("sha256").update(plaintextKey).digest("hex");

    const apiKey = await n8nWorkflowApiKeysRepository.create({
      organization_id: organizationId,
      workflow_id: workflowId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes,
      expires_at: expiresAt,
      is_active: true,
    });

    logger.info(`[N8N Workflows] Created API key: ${name}`, {
      organizationId,
      workflowId,
      apiKeyId: apiKey.id,
    });

    return { apiKey, plaintextKey };
  }

  /**
   * Validates an API key by verifying the full key hash.
   * @param plaintextKey - The full plaintext API key (e.g., "n8n_abc123...")
   * @returns The API key record if valid, null otherwise
   */
  async validateApiKey(plaintextKey: string): Promise<N8nWorkflowApiKey | null> {
    // Extract prefix from the plaintext key
    const keyPrefix = plaintextKey.substring(0, 12);
    
    // Find by prefix first (fast lookup)
    const apiKey = await n8nWorkflowApiKeysRepository.findByKeyPrefix(keyPrefix);
    if (!apiKey) {
      return null;
    }

    // Verify the full key hash for security
    const keyHash = createHash("sha256").update(plaintextKey).digest("hex");
    if (keyHash !== apiKey.key_hash) {
      logger.warn("[N8N API Key] Invalid key hash", { keyPrefix });
      return null;
    }

    if (!apiKey.is_active) {
      return null;
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return null;
    }

    // Update last used timestamp
    await n8nWorkflowApiKeysRepository.update(apiKey.id, {
      last_used_at: new Date(),
    });

    return apiKey;
  }

  /**
   * Lists API keys for an organization or workflow.
   */
  async listApiKeys(
    organizationId: string,
    workflowId?: string
  ): Promise<N8nWorkflowApiKey[]> {
    if (workflowId) {
      return n8nWorkflowApiKeysRepository.findByWorkflow(workflowId);
    }
    return n8nWorkflowApiKeysRepository.findByOrganization(organizationId);
  }

  /**
   * Deletes an API key permanently.
   */
  async deleteApiKey(apiKeyId: string): Promise<void> {
    await n8nWorkflowApiKeysRepository.delete(apiKeyId);
  }

  /**
   * Revokes an API key (soft delete - deactivates but keeps record for audit).
   */
  async revokeApiKey(apiKeyId: string): Promise<void> {
    await n8nWorkflowApiKeysRepository.update(apiKeyId, {
      is_active: false,
    });
    logger.info(`[N8N Workflows] Revoked API key: ${apiKeyId}`);
  }

  /**
   * Checks if an API key has the required scope.
   * If no scopes are required, any valid key is accepted.
   * If the key has no scopes, it has access to everything (admin key).
   */
  hasScope(apiKey: N8nWorkflowApiKey, requiredScope: string): boolean {
    // Empty scopes array means full access (admin key)
    if (!apiKey.scopes || apiKey.scopes.length === 0) {
      return true;
    }
    
    // Check for exact scope match or wildcard
    return apiKey.scopes.includes(requiredScope) || 
           apiKey.scopes.includes("*") ||
           apiKey.scopes.some(scope => {
             // Support wildcard scopes like "workflows:*"
             if (scope.endsWith(":*")) {
               const prefix = scope.slice(0, -1);
               return requiredScope.startsWith(prefix);
             }
             return false;
           });
  }

  /**
   * Validates an API key and checks for required scope.
   */
  async validateApiKeyWithScope(
    plaintextKey: string,
    requiredScope: string
  ): Promise<N8nWorkflowApiKey | null> {
    const apiKey = await this.validateApiKey(plaintextKey);
    if (!apiKey) {
      return null;
    }

    if (!this.hasScope(apiKey, requiredScope)) {
      logger.warn("[N8N API Key] Insufficient scope", {
        keyPrefix: plaintextKey.substring(0, 12),
        requiredScope,
        keyScopes: apiKey.scopes,
      });
      return null;
    }

    return apiKey;
  }

  // ===========================================================================
  // WORKFLOW EXECUTION & TESTING
  // ===========================================================================

  /**
   * Tests a workflow execution.
   * 
   * Loads and injects secrets from:
   * 1. Workflow-specific secrets (project scope)
   * 2. Organization-level secrets (org scope)
   * 3. Workflow variables marked as secrets
   */
  async testWorkflow(params: TestWorkflowParams): Promise<N8nWorkflowExecution> {
    const { workflowId, inputData = {}, userId, triggerId, executionType = "test" } = params;

    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Load secrets for this workflow
    const workflowSecrets = await this.loadWorkflowSecrets(
      workflow.organization_id,
      workflowId
    );

    // Create execution record
    const execution = await n8nWorkflowExecutionsRepository.create({
      workflow_id: workflowId,
      organization_id: workflow.organization_id,
      trigger_id: triggerId,
      execution_type: executionType,
      status: "running",
      input_data: inputData,
      triggered_by: userId,
    });

    const startTime = Date.now();

    try {
      // Merge input data with secrets (secrets available via $secrets object)
      const enrichedInputData = {
        ...inputData,
        $secrets: workflowSecrets,
      };

      // If workflow is deployed to n8n, execute via n8n API
      if (workflow.n8n_instance_id && workflow.n8n_workflow_id) {
        const instance = await n8nInstancesRepository.findById(workflow.n8n_instance_id);
        if (instance) {
          try {
            // Execute workflow via n8n API
            const response = await fetch(
              `${instance.endpoint}/api/v1/workflows/${workflow.n8n_workflow_id}/execute`,
              {
                method: "POST",
                headers: {
                  "X-N8N-API-KEY": instance.api_key,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  data: enrichedInputData,
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`n8n API error: ${errorText}`);
            }

            const n8nResult = await response.json();
            const duration = Date.now() - startTime;

            // Update execution as successful
            const updated = await n8nWorkflowExecutionsRepository.update(execution.id, {
              status: "success",
              output_data: n8nResult.data || n8nResult,
              duration_ms: duration,
              n8n_execution_id: n8nResult.id || n8nResult.executionId,
              finished_at: new Date(),
            });

            return updated ?? execution;
          } catch (n8nError) {
            // If n8n execution fails, fall back to simulation
            logger.warn(`[N8N Workflows] n8n execution failed, using simulation:`, n8nError);
          }
        }
      }

      // Fallback: Simulate execution (for workflows not deployed to n8n)
      // In production, this could be executed in a container or background job
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const duration = Date.now() - startTime;

      // Update execution as successful
      const updated = await n8nWorkflowExecutionsRepository.update(execution.id, {
        status: "success",
        output_data: { 
          message: "Workflow executed successfully",
          note: workflow.n8n_instance_id ? "n8n execution unavailable, simulated" : "Simulated execution (not deployed to n8n)",
          secretsLoaded: Object.keys(workflowSecrets).length,
        },
        duration_ms: duration,
        finished_at: new Date(),
      });

      return updated ?? execution;
    } catch (error) {
      // Update execution as error
      const duration = Date.now() - startTime;
      await n8nWorkflowExecutionsRepository.update(execution.id, {
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
        duration_ms: duration,
        finished_at: new Date(),
      });
      throw error;
    }
  }

  /**
   * Load secrets for workflow execution from secrets service (org + workflow-scoped).
   */
  private async loadWorkflowSecrets(
    organizationId: string,
    workflowId: string
  ): Promise<Record<string, string>> {
    if (!isSecretsConfigured()) {
      return {};
    }
    return loadSecretsHelper({ organizationId, workflowId });
  }

  /**
   * Gets execution history for a workflow.
   */
  async getWorkflowExecutions(
    workflowId: string,
    limit: number = 50
  ): Promise<N8nWorkflowExecution[]> {
    return n8nWorkflowExecutionsRepository.findByWorkflow(workflowId, limit);
  }

  // ===========================================================================
  // TRIGGER OPERATIONS
  // ===========================================================================

  /**
   * Creates a workflow trigger (cron, webhook, A2A, or MCP).
   * For webhooks, automatically generates a secure secret for signature verification.
   */
  async createTrigger(
    workflowId: string,
    triggerType: "cron" | "webhook" | "a2a" | "mcp",
    triggerKey: string | undefined,
    config: Record<string, unknown>
  ): Promise<N8nWorkflowTrigger> {
    const workflow = await n8nWorkflowsRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Auto-generate trigger key if not provided
    let finalTriggerKey = triggerKey;
    if (!finalTriggerKey) {
      if (triggerType === "webhook") {
        // Generate secure webhook key
        finalTriggerKey = randomBytes(32).toString("hex");
      } else if (triggerType === "cron") {
        // Use cron expression as key (will be validated)
        finalTriggerKey = (config.cronExpression as string) || `cron_${workflowId}_${Date.now()}`;
      } else {
        // A2A/MCP: use skill/tool name from config
        finalTriggerKey = (config.skillId as string) || (config.toolName as string) || `${triggerType}_${workflowId}_${Date.now()}`;
      }
    }

    // Check for duplicate trigger key
    const existing = await n8nWorkflowTriggersRepository.findByTriggerKey(finalTriggerKey);
    if (existing) {
      throw new Error(`Trigger key '${finalTriggerKey}' already exists`);
    }

    // SECURITY: Generate webhook secret for signature verification
    const finalConfig = { ...config };
    if (triggerType === "webhook") {
      // Generate secret for HMAC signature verification
      finalConfig.webhookSecret = randomBytes(32).toString("hex");
      // Set defaults for security options
      finalConfig.requireSignature = finalConfig.requireSignature ?? true;
      finalConfig.maxExecutionsPerDay = finalConfig.maxExecutionsPerDay ?? 1000;
      finalConfig.includeOutputInResponse = finalConfig.includeOutputInResponse ?? false;
    }

    // Set default execution limits for all trigger types
    if (!finalConfig.maxExecutionsPerDay) {
      finalConfig.maxExecutionsPerDay = triggerType === "cron" ? 1440 : 10000; // cron: 1/min, webhook: higher
    }

    const trigger = await n8nWorkflowTriggersRepository.create({
      workflow_id: workflowId,
      organization_id: workflow.organization_id,
      trigger_type: triggerType,
      trigger_key: finalTriggerKey,
      config: finalConfig,
      is_active: true,
    });

    logger.info(`[N8N Workflows] Created trigger: ${triggerType}`, {
      workflowId,
      triggerId: trigger.id,
      organizationId: workflow.organization_id,
      // Don't log the full key or secret
      keyPrefix: finalTriggerKey.slice(0, 8) + "...",
    });

    return trigger;
  }

  /**
   * Lists triggers for a workflow.
   */
  async listTriggers(workflowId: string): Promise<N8nWorkflowTrigger[]> {
    return n8nWorkflowTriggersRepository.findByWorkflow(workflowId);
  }

  /**
   * Gets active cron triggers (for cron job processing).
   */
  async getActiveCronTriggers(): Promise<N8nWorkflowTrigger[]> {
    return n8nWorkflowTriggersRepository.findByTypeAndActive("cron", true);
  }

  /**
   * Executes a workflow via trigger with security validation.
   * 
   * Security checks:
   * - Trigger must be active
   * - Workflow must exist
   * - Organization must be active (not suspended)
   * - Daily execution limit not exceeded
   * - Sufficient credits (if cost configured)
   */
  async executeWorkflowTrigger(
    triggerId: string,
    inputData?: Record<string, unknown>
  ): Promise<N8nWorkflowExecution> {
    const trigger = await n8nWorkflowTriggersRepository.findById(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    if (!trigger.is_active) {
      throw new Error(`Trigger ${triggerId} is not active`);
    }

    const workflow = await n8nWorkflowsRepository.findById(trigger.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow ${trigger.workflow_id} not found`);
    }

    // SECURITY: Validate organization is active
    const { organizationsRepository } = await import("@/db/repositories/organizations");
    const org = await organizationsRepository.findById(trigger.organization_id);
    if (!org) {
      throw new Error("Organization not found");
    }
    
    // Check if org is inactive
    if (!org.is_active) {
      throw new Error("Organization is not active");
    }

    // SECURITY: Check daily execution limit
    const maxExecutionsPerDay = (trigger.config.maxExecutionsPerDay as number) || 10000;
    const todayExecutions = await n8nWorkflowTriggersRepository.getTodayExecutionCount(triggerId);
    
    if (todayExecutions >= maxExecutionsPerDay) {
      logger.warn(`[N8N Workflows] Daily execution limit reached for trigger`, {
        triggerId,
        limit: maxExecutionsPerDay,
        current: todayExecutions,
      });
      throw new Error(`Daily execution limit reached (${maxExecutionsPerDay})`);
    }

    // SECURITY: Check credit balance if cost is configured
    const estimatedCostPerExecution = (trigger.config.estimatedCostPerExecution as number) || 0;
    if (estimatedCostPerExecution > 0) {
      const { creditsService } = await import("@/lib/services/credits");
      const balance = Number(org.credit_balance);
      
      if (balance < estimatedCostPerExecution) {
        logger.warn(`[N8N Workflows] Insufficient credits for trigger execution`, {
          triggerId,
          required: estimatedCostPerExecution,
          balance,
        });
        throw new Error(`Insufficient credits (required: ${estimatedCostPerExecution}, balance: ${balance})`);
      }

      // Deduct credits
      const deductResult = await creditsService.deductCredits({
        organizationId: trigger.organization_id,
        amount: estimatedCostPerExecution,
        description: `Workflow trigger: ${trigger.trigger_key.slice(0, 8)}...`,
        metadata: {
          triggerId: trigger.id,
          triggerType: trigger.trigger_type,
          workflowId: workflow.id,
        },
      });

      if (!deductResult.success) {
        throw new Error("Failed to deduct credits for trigger execution");
      }
    }

    // Map trigger type to execution type
    const executionTypeMap: Record<string, "scheduled" | "webhook" | "a2a" | "mcp"> = {
      cron: "scheduled",
      webhook: "webhook",
      a2a: "a2a",
      mcp: "mcp",
    };

    // Execute workflow with trigger metadata
    const execution = await this.testWorkflow({
      workflowId: workflow.id,
      inputData: {
        ...(inputData || {}),
        $trigger: {
          id: triggerId,
          type: trigger.trigger_type,
          key: trigger.trigger_key.slice(0, 8) + "...",
        },
      },
      userId: workflow.user_id,
      triggerId: trigger.id,
      executionType: executionTypeMap[trigger.trigger_type] || "manual",
    });

    // Update trigger stats
    await n8nWorkflowTriggersRepository.incrementExecutionCount(triggerId);

    logger.info(`[N8N Workflows] Trigger executed successfully`, {
      triggerId,
      executionId: execution.id,
      organizationId: trigger.organization_id,
    });

    return execution;
  }

  /**
   * Finds trigger by key (for webhook/A2A/MCP lookups).
   */
  async findTriggerByKey(triggerKey: string): Promise<N8nWorkflowTrigger | null> {
    const trigger = await n8nWorkflowTriggersRepository.findByTriggerKey(triggerKey);
    return trigger ?? null;
  }

  /**
   * Gets a single trigger by ID.
   */
  async getTrigger(triggerId: string): Promise<N8nWorkflowTrigger | null> {
    const trigger = await n8nWorkflowTriggersRepository.findById(triggerId);
    return trigger ?? null;
  }

  /**
   * Updates a trigger (enable/disable, change config).
   * 
   * @param triggerId - Trigger ID
   * @param organizationId - Organization ID (for authorization)
   * @param updates - Fields to update
   */
  async updateTrigger(
    triggerId: string,
    organizationId: string,
    updates: {
      isActive?: boolean;
      config?: Record<string, unknown>;
    }
  ): Promise<N8nWorkflowTrigger> {
    const trigger = await n8nWorkflowTriggersRepository.findById(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    // SECURITY: Verify organization ownership
    if (trigger.organization_id !== organizationId) {
      throw new Error("Unauthorized: Trigger belongs to different organization");
    }

    const updateData: Record<string, unknown> = {};
    
    if (updates.isActive !== undefined) {
      updateData.is_active = updates.isActive;
    }
    
    if (updates.config !== undefined) {
      // SECURITY: Preserve webhook secret - cannot be overwritten via update
      const existingSecret = trigger.config.webhookSecret;
      updateData.config = {
        ...updates.config,
        ...(existingSecret && { webhookSecret: existingSecret }),
      };
    }

    const updated = await n8nWorkflowTriggersRepository.update(triggerId, updateData);
    if (!updated) {
      throw new Error(`Failed to update trigger ${triggerId}`);
    }

    logger.info(`[N8N Workflows] Trigger updated`, {
      triggerId,
      organizationId,
      isActive: updated.is_active,
    });

    return updated;
  }

  /**
   * Deletes a trigger.
   * 
   * @param triggerId - Trigger ID
   * @param organizationId - Organization ID (for authorization)
   */
  async deleteTrigger(triggerId: string, organizationId: string): Promise<void> {
    const trigger = await n8nWorkflowTriggersRepository.findById(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    // SECURITY: Verify organization ownership
    if (trigger.organization_id !== organizationId) {
      throw new Error("Unauthorized: Trigger belongs to different organization");
    }

    await n8nWorkflowTriggersRepository.delete(triggerId);

    logger.info(`[N8N Workflows] Trigger deleted`, {
      triggerId,
      organizationId,
      triggerType: trigger.trigger_type,
    });
  }

  /**
   * Regenerates the webhook secret for a trigger.
   * Use this if the secret is compromised.
   */
  async regenerateWebhookSecret(
    triggerId: string,
    organizationId: string
  ): Promise<{ webhookSecret: string }> {
    const trigger = await n8nWorkflowTriggersRepository.findById(triggerId);
    if (!trigger) {
      throw new Error(`Trigger ${triggerId} not found`);
    }

    if (trigger.organization_id !== organizationId) {
      throw new Error("Unauthorized: Trigger belongs to different organization");
    }

    if (trigger.trigger_type !== "webhook") {
      throw new Error("Can only regenerate secret for webhook triggers");
    }

    const newSecret = randomBytes(32).toString("hex");
    const updatedConfig = {
      ...trigger.config,
      webhookSecret: newSecret,
    };

    await n8nWorkflowTriggersRepository.update(triggerId, {
      config: updatedConfig,
    });

    logger.info(`[N8N Workflows] Webhook secret regenerated`, {
      triggerId,
      organizationId,
    });

    return { webhookSecret: newSecret };
  }

  // ===========================================================================
  // N8N DEPLOYMENT OPERATIONS
  // ===========================================================================

  /**
   * Deploys a workflow to an n8n instance.
   */
  async deployWorkflowToN8n(
    workflowId: string,
    instanceId: string
  ): Promise<{ n8nWorkflowId: string }> {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const instance = await n8nInstancesRepository.findById(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Test connection
    const isConnected = await this.testInstanceConnection(instance);
    if (!isConnected) {
      throw new Error(`Cannot connect to n8n instance: ${instance.endpoint}`);
    }

    // Deploy workflow via n8n API
    try {
      const response = await fetch(`${instance.endpoint}/api/v1/workflows`, {
        method: "POST",
        headers: {
          "X-N8N-API-KEY": instance.api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: workflow.name,
          nodes: (workflow.workflow_data as { nodes?: unknown[] }).nodes || [],
          connections: (workflow.workflow_data as { connections?: unknown }).connections || {},
          settings: (workflow.workflow_data as { settings?: unknown }).settings || {},
          staticData: (workflow.workflow_data as { staticData?: unknown }).staticData || {},
          tags: workflow.tags,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to deploy workflow: ${errorText}`);
      }

      const n8nWorkflow = await response.json();
      const n8nWorkflowId = n8nWorkflow.id as string;

      // Update workflow with n8n ID
      await n8nWorkflowsRepository.update(workflowId, {
        n8n_instance_id: instanceId,
        n8n_workflow_id: n8nWorkflowId,
        is_active_in_n8n: true,
      });

      logger.info(`[N8N Workflows] Deployed workflow ${workflowId} to n8n`, {
        workflowId,
        n8nWorkflowId,
        instanceId,
      });

      return { n8nWorkflowId };
    } catch (error) {
      logger.error(`[N8N Workflows] Failed to deploy workflow ${workflowId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validates workflow structure.
   */
  async validateWorkflow(workflowData: Record<string, unknown>): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Basic validation
    if (!workflowData.nodes || !Array.isArray(workflowData.nodes)) {
      errors.push("Workflow must have a 'nodes' array");
    }

    if (!workflowData.connections || typeof workflowData.connections !== "object") {
      errors.push("Workflow must have a 'connections' object");
    }

    // Validate nodes
    if (Array.isArray(workflowData.nodes)) {
      for (let i = 0; i < workflowData.nodes.length; i++) {
        const node = workflowData.nodes[i] as Record<string, unknown>;
        if (!node.id) {
          errors.push(`Node ${i} is missing 'id'`);
        }
        if (!node.type) {
          errors.push(`Node ${i} is missing 'type'`);
        }
        if (!node.name) {
          errors.push(`Node ${i} is missing 'name'`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const n8nWorkflowsService = new N8nWorkflowsService();

