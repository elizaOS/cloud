/**
 * Workflow Template Search Service
 *
 * Enables semantic search for similar workflow templates before generation.
 * Shaw's vision: "I'm going to search for similar workflows I already have...
 * Those are valuable, viable workflows."
 *
 * Key capabilities:
 * - Generate embeddings for user intent
 * - Search for similar templates using pgvector
 * - Save successful workflows as templates
 */

import { logger } from "@/lib/utils/logger";
import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  workflowTemplatesRepository,
  type TemplateSearchResult,
} from "@/db/repositories/workflow-templates";
import type {
  WorkflowTemplate,
  NewWorkflowTemplate,
} from "@/db/schemas/workflow-templates";
import type { GeneratedWorkflow } from "@/db/schemas/generated-workflows";
import { secretDependencyExtractor } from "./secret-dependency-extractor";

/**
 * Configuration for template search
 */
interface TemplateSearchOptions {
  limit?: number;
  minSimilarity?: number;
  includePublic?: boolean;
  includeSystem?: boolean;
}

/**
 * Result of a template match with context
 */
export interface TemplateMatchResult {
  template: WorkflowTemplate;
  similarity: number;
  matchReason: string;
  canAdapt: boolean; // Whether the template can be directly adapted
}

/**
 * Workflow Template Search Service
 */
class WorkflowTemplateSearchService {
  private openai: ReturnType<typeof createOpenAI> | null = null;

  /**
   * Initialize with OpenAI API key for embeddings
   */
  initialize(apiKey: string): void {
    this.openai = createOpenAI({ apiKey });
    logger.info("[TemplateSearch] Initialized with OpenAI API");
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.openai !== null;
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        this.initialize(apiKey);
      } else {
        throw new Error(
          "WorkflowTemplateSearch not initialized. Call initialize() with API key or set OPENAI_API_KEY.",
        );
      }
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    this.ensureInitialized();

    try {
      const result = await embed({
        model: this.openai!.embedding("text-embedding-3-small"),
        value: text,
      });

      return result.embedding;
    } catch (error) {
      logger.error("[TemplateSearch] Failed to generate embedding", {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length,
      });
      throw error;
    }
  }

  /**
   * Search for similar templates using semantic search
   */
  async findSimilar(
    userIntent: string,
    organizationId: string,
    options?: TemplateSearchOptions,
  ): Promise<TemplateMatchResult[]> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      // Generate embedding for user intent
      const embedding = await this.generateEmbedding(userIntent);

      // Search for similar templates
      const searchResults = await workflowTemplatesRepository.searchBySimilarity(
        embedding,
        organizationId,
        {
          minSimilarity: options?.minSimilarity ?? 0.7,
          limit: options?.limit ?? 5,
          includePublic: options?.includePublic ?? true,
          includeSystem: options?.includeSystem ?? true,
        },
      );

      // Convert to TemplateMatchResult with analysis
      const results: TemplateMatchResult[] = searchResults.map((result) => {
        const matchReason = this.analyzeMatchReason(
          userIntent,
          result.template,
          result.similarity,
        );
        const canAdapt = result.similarity >= 0.85; // High confidence for direct adaptation

        return {
          template: result.template,
          similarity: result.similarity,
          matchReason,
          canAdapt,
        };
      });

      logger.info("[TemplateSearch] Search completed", {
        userIntent: userIntent.substring(0, 50),
        organizationId,
        resultsCount: results.length,
        topSimilarity: results[0]?.similarity ?? 0,
        durationMs: Date.now() - startTime,
      });

      return results;
    } catch (error) {
      logger.error("[TemplateSearch] Search failed", {
        error: error instanceof Error ? error.message : String(error),
        userIntent: userIntent.substring(0, 50),
        organizationId,
      });

      // Return empty results on error (don't block workflow generation)
      return [];
    }
  }

  /**
   * Analyze why a template matches the user intent
   */
  private analyzeMatchReason(
    userIntent: string,
    template: WorkflowTemplate,
    similarity: number,
  ): string {
    const intentWords = new Set(userIntent.toLowerCase().split(/\s+/));
    const templateWords = new Set(
      template.user_intent.toLowerCase().split(/\s+/),
    );

    const commonWords = [...intentWords].filter((w) => templateWords.has(w));

    if (similarity >= 0.9) {
      return "Near-exact match to your request";
    } else if (similarity >= 0.8) {
      return `High similarity - both involve ${template.service_dependencies?.slice(0, 2).join(" and ") || "similar services"}`;
    } else if (commonWords.length > 3) {
      return `Matches keywords: ${commonWords.slice(0, 4).join(", ")}`;
    } else {
      return `Similar workflow pattern using ${template.service_dependencies?.[0] || "similar services"}`;
    }
  }

  /**
   * Save a workflow as a template
   */
  async saveAsTemplate(
    workflow: GeneratedWorkflow,
    options?: {
      description?: string;
      isPublic?: boolean;
      tags?: string[];
      category?: string;
    },
  ): Promise<WorkflowTemplate> {
    try {
      this.ensureInitialized();

      // Check if template already exists for this workflow
      const existingTemplate =
        await workflowTemplatesRepository.getBySourceWorkflow(workflow.id);
      if (existingTemplate) {
        logger.info("[TemplateSearch] Template already exists for workflow", {
          workflowId: workflow.id,
          templateId: existingTemplate.id,
        });
        return existingTemplate;
      }

      // Generate embedding from intent + description
      const textForEmbedding = `${workflow.user_intent}. ${options?.description || workflow.description || ""}`.trim();
      const embedding = await this.generateEmbedding(textForEmbedding);

      // Extract secret requirements from execution plan
      const secretRequirements = secretDependencyExtractor.extractFromPlan(
        workflow.execution_plan as Array<{
          step: number;
          serviceId: string;
          operation: string;
        }>,
      );

      // Create the template
      const newTemplate: NewWorkflowTemplate = {
        organization_id: workflow.organization_id,
        source_workflow_id: workflow.id,
        name: workflow.name,
        description: options?.description || workflow.description || workflow.user_intent,
        user_intent: workflow.user_intent,
        embedding,
        generated_code: workflow.generated_code,
        execution_plan: workflow.execution_plan as WorkflowTemplate["execution_plan"],
        service_dependencies: workflow.service_dependencies as string[],
        secret_requirements: secretRequirements.map((r) => ({
          provider: r.provider,
          type: r.type,
          scopes: r.scopes,
          displayName: r.displayName,
          description: r.description,
        })),
        tags: options?.tags || (workflow.tags as string[]) || [],
        category: options?.category || workflow.category || "custom",
        is_public: options?.isPublic ?? false,
        is_system: false,
        usage_count: workflow.usage_count,
        success_count: workflow.success_count,
        success_rate: workflow.success_rate,
        avg_execution_time_ms: workflow.avg_execution_time_ms,
      };

      const template = await workflowTemplatesRepository.create(newTemplate);

      logger.info("[TemplateSearch] Workflow saved as template", {
        workflowId: workflow.id,
        templateId: template.id,
        name: template.name,
      });

      return template;
    } catch (error) {
      logger.error("[TemplateSearch] Failed to save workflow as template", {
        workflowId: workflow.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a template by ID
   */
  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    return workflowTemplatesRepository.getById(templateId);
  }

  /**
   * Increment template usage
   */
  async incrementUsage(templateId: string, success: boolean): Promise<void> {
    await workflowTemplatesRepository.incrementUsage(templateId, success);
  }
}

export const workflowTemplateSearchService = new WorkflowTemplateSearchService();
