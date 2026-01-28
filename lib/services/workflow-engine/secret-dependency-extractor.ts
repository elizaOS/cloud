/**
 * Secret Dependency Extractor
 *
 * Extracts and manages secret/credential requirements from workflow execution plans.
 * This enables dynamic tracking of what credentials each workflow needs,
 * replacing the hardcoded WORKFLOW_CREDENTIALS mapping.
 */

import { logger } from "@/lib/utils/logger";
import { GOOGLE_SCOPES } from "@/lib/utils/google-api";
import { workflowSecretRequirementsRepository } from "@/db/repositories/workflow-secret-requirements";
import type { NewWorkflowSecretRequirement } from "@/db/schemas/workflow-secret-requirements";

/**
 * Extracted requirement from execution plan
 */
export interface ExtractedRequirement {
  provider: string;
  type: "oauth" | "api_key" | "credential";
  secretKey?: string;
  scopes?: string[];
  displayName: string;
  description: string;
  authUrl: string;
  stepNumber: number;
}

/**
 * Execution plan step structure
 */
export interface ExecutionPlanStep {
  step: number;
  serviceId: string;
  operation: string;
  resource?: string;
}

/**
 * Service operation to requirement mapping
 */
interface OperationRequirement {
  provider: string;
  type: "oauth" | "api_key" | "credential";
  secretKey?: string;
  scopes?: string[];
  displayName: string;
  description: string;
}

/**
 * Base URL for auth redirects
 */
const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

/**
 * Get auth URL for a provider
 */
const getAuthUrl = (provider: string): string => {
  const baseUrl = getBaseUrl();
  switch (provider) {
    case "google":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=google`;
    case "twilio":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=twilio`;
    case "blooio":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=blooio`;
    case "notion":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=notion`;
    case "telegram":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=telegram`;
    default:
      return `${baseUrl}/dashboard/settings?tab=connections`;
  }
};

/**
 * Mapping of service operations to their credential requirements
 */
const OPERATION_REQUIREMENTS: Record<string, OperationRequirement> = {
  // Google Email operations
  "google.email.send": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_SEND],
    displayName: "Google Gmail",
    description: "Gmail access to send emails",
  },
  "google.email.sendEmail": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_SEND],
    displayName: "Google Gmail",
    description: "Gmail access to send emails",
  },
  "google.email.list": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
    displayName: "Google Gmail",
    description: "Gmail access to read emails",
  },
  "google.email.listEmails": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
    displayName: "Google Gmail",
    description: "Gmail access to read emails",
  },
  "google.email.get": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
    displayName: "Google Gmail",
    description: "Gmail access to read emails",
  },
  "google.email.getEmail": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
    displayName: "Google Gmail",
    description: "Gmail access to read emails",
  },

  // Google Calendar operations
  "google.calendar.list": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CALENDAR_READONLY],
    displayName: "Google Calendar",
    description: "Calendar access to view events",
  },
  "google.calendar.listCalendarEvents": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CALENDAR_READONLY],
    displayName: "Google Calendar",
    description: "Calendar access to view events",
  },
  "google.calendar.create": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CALENDAR_EVENTS],
    displayName: "Google Calendar",
    description: "Calendar access to create events",
  },
  "google.calendar.createCalendarEvent": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CALENDAR_EVENTS],
    displayName: "Google Calendar",
    description: "Calendar access to create events",
  },

  // Google Contacts operations
  "google.contacts.lookup": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CONTACTS_READONLY],
    displayName: "Google Contacts",
    description: "Contacts access to look up contacts",
  },
  "google.contacts.list": {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.CONTACTS_READONLY],
    displayName: "Google Contacts",
    description: "Contacts access to list contacts",
  },

  // Twilio operations
  "twilio.sms.send": {
    provider: "twilio",
    type: "api_key",
    secretKey: "twilio_auth_token",
    displayName: "Twilio SMS",
    description: "Twilio access to send SMS messages",
  },
  "twilio.sms.sendSms": {
    provider: "twilio",
    type: "api_key",
    secretKey: "twilio_auth_token",
    displayName: "Twilio SMS",
    description: "Twilio access to send SMS messages",
  },

  // Blooio operations (iMessage)
  "blooio.imessage.send": {
    provider: "blooio",
    type: "api_key",
    secretKey: "BLOOIO_API_KEY",
    displayName: "Blooio iMessage",
    description: "Blooio access to send iMessages",
  },
  "blooio.imessage.sendIMessage": {
    provider: "blooio",
    type: "api_key",
    secretKey: "BLOOIO_API_KEY",
    displayName: "Blooio iMessage",
    description: "Blooio access to send iMessages",
  },

  // Notion operations
  "notion.page.create": {
    provider: "notion",
    type: "api_key",
    secretKey: "notion_api_key",
    displayName: "Notion",
    description: "Notion access to create pages",
  },
  "notion.page.update": {
    provider: "notion",
    type: "api_key",
    secretKey: "notion_api_key",
    displayName: "Notion",
    description: "Notion access to update pages",
  },
  "notion.database.query": {
    provider: "notion",
    type: "api_key",
    secretKey: "notion_api_key",
    displayName: "Notion",
    description: "Notion access to query databases",
  },

  // Telegram operations
  "telegram.message.send": {
    provider: "telegram",
    type: "api_key",
    secretKey: "TELEGRAM_BOT_TOKEN",
    displayName: "Telegram Bot",
    description: "Telegram bot access to send messages",
  },
};

/**
 * Fallback requirements based on service ID only
 */
const SERVICE_FALLBACK_REQUIREMENTS: Record<string, OperationRequirement> = {
  google: {
    provider: "google",
    type: "oauth",
    scopes: [GOOGLE_SCOPES.GMAIL_SEND, GOOGLE_SCOPES.CALENDAR_EVENTS],
    displayName: "Google",
    description: "Google account access",
  },
  twilio: {
    provider: "twilio",
    type: "api_key",
    secretKey: "twilio_auth_token",
    displayName: "Twilio",
    description: "Twilio access for SMS",
  },
  blooio: {
    provider: "blooio",
    type: "api_key",
    secretKey: "BLOOIO_API_KEY",
    displayName: "Blooio",
    description: "Blooio access for iMessage",
  },
  notion: {
    provider: "notion",
    type: "api_key",
    secretKey: "notion_api_key",
    displayName: "Notion",
    description: "Notion access",
  },
  telegram: {
    provider: "telegram",
    type: "api_key",
    secretKey: "TELEGRAM_BOT_TOKEN",
    displayName: "Telegram",
    description: "Telegram bot access",
  },
};

/**
 * Secret Dependency Extractor Service
 */
class SecretDependencyExtractorService {
  /**
   * Extract requirements from an execution plan
   */
  extractFromPlan(executionPlan: ExecutionPlanStep[]): ExtractedRequirement[] {
    const requirements: ExtractedRequirement[] = [];
    const seenProviders = new Set<string>();

    for (const step of executionPlan) {
      // Try specific operation key first
      const operationKeys = this.buildOperationKeys(step);
      let req: OperationRequirement | undefined;

      for (const key of operationKeys) {
        req = OPERATION_REQUIREMENTS[key];
        if (req) break;
      }

      // Fall back to service-level requirement
      if (!req) {
        req = SERVICE_FALLBACK_REQUIREMENTS[step.serviceId];
      }

      if (req && !seenProviders.has(req.provider)) {
        seenProviders.add(req.provider);
        requirements.push({
          ...req,
          authUrl: getAuthUrl(req.provider),
          stepNumber: step.step,
        });
      }
    }

    logger.info("[SecretDependencyExtractor] Extracted requirements", {
      planSteps: executionPlan.length,
      requirements: requirements.length,
      providers: Array.from(seenProviders),
    });

    return requirements;
  }

  /**
   * Build possible operation keys for lookup
   */
  private buildOperationKeys(step: ExecutionPlanStep): string[] {
    const keys: string[] = [];
    const { serviceId, operation, resource } = step;

    // Most specific: service.resource.operation
    if (resource) {
      keys.push(`${serviceId}.${resource}.${operation}`);
    }

    // service.operation (common pattern)
    keys.push(`${serviceId}.${operation}`);

    // Try with common resource names
    const commonResources = ["email", "calendar", "sms", "imessage", "page", "message"];
    for (const res of commonResources) {
      keys.push(`${serviceId}.${res}.${operation}`);
    }

    return keys;
  }

  /**
   * Save extracted requirements to database for a workflow
   */
  async saveForWorkflow(
    workflowId: string,
    requirements: ExtractedRequirement[],
  ): Promise<void> {
    try {
      const dbRequirements: Omit<NewWorkflowSecretRequirement, "workflow_id">[] =
        requirements.map((req) => ({
          provider: req.provider,
          requirement_type: req.type,
          secret_key: req.secretKey,
          scopes: req.scopes,
          display_name: req.displayName,
          description: req.description,
          auth_url: req.authUrl,
          required: true,
          step_number: req.stepNumber,
        }));

      await workflowSecretRequirementsRepository.replaceForWorkflow(
        workflowId,
        dbRequirements,
      );

      logger.info("[SecretDependencyExtractor] Saved requirements for workflow", {
        workflowId,
        requirementsCount: requirements.length,
      });
    } catch (error) {
      logger.error("[SecretDependencyExtractor] Failed to save requirements", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract and save requirements for a workflow in one call
   */
  async extractAndSave(
    workflowId: string,
    executionPlan: ExecutionPlanStep[],
  ): Promise<ExtractedRequirement[]> {
    const requirements = this.extractFromPlan(executionPlan);
    await this.saveForWorkflow(workflowId, requirements);
    return requirements;
  }

  /**
   * Get requirements for a workflow from database
   */
  async getForWorkflow(workflowId: string): Promise<ExtractedRequirement[]> {
    const dbRequirements =
      await workflowSecretRequirementsRepository.getByWorkflowId(workflowId);

    return dbRequirements.map((req) => ({
      provider: req.provider,
      type: req.requirement_type,
      secretKey: req.secret_key ?? undefined,
      scopes: req.scopes ?? undefined,
      displayName: req.display_name,
      description: req.description,
      authUrl: req.auth_url ?? getAuthUrl(req.provider),
      stepNumber: req.step_number ?? 0,
    }));
  }

  /**
   * Check if a workflow has requirements stored
   */
  async hasStoredRequirements(workflowId: string): Promise<boolean> {
    return workflowSecretRequirementsRepository.hasRequirements(workflowId);
  }
}

export const secretDependencyExtractor = new SecretDependencyExtractorService();
