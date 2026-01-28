/**
 * Credential Validator
 *
 * Validates that users have the required OAuth credentials before
 * executing workflows. Returns missing credentials with auth URLs
 * so users can be prompted to connect.
 *
 * Enhanced to use database-driven requirements while maintaining
 * backwards compatibility with the legacy hardcoded mapping.
 */

import { googleAutomationService } from "@/lib/services/google-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { workflowSecretRequirementsRepository } from "@/db/repositories/workflow-secret-requirements";
import { GOOGLE_SCOPES } from "@/lib/utils/google-api";
import { logger } from "@/lib/utils/logger";

export type CredentialProvider = "google" | "blooio" | "twilio" | "notion" | "telegram";

export interface RequiredCredential {
  provider: CredentialProvider;
  scopes?: string[];
  description: string;
}

export interface MissingCredential {
  provider: CredentialProvider;
  scopes?: string[];
  description: string;
  displayName?: string;
  authUrl?: string;
  stepNumber?: number;
}

export interface InvalidCredential {
  provider: CredentialProvider;
  displayName?: string;
  reason: string;
  authUrl?: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: MissingCredential[];
  invalid?: InvalidCredential[];
  preflightFailure?: boolean;
}

/**
 * Legacy workflow credential requirements (for backwards compatibility)
 */
export const WORKFLOW_CREDENTIALS: Record<string, RequiredCredential[]> = {
  check_email: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.GMAIL_READONLY],
      description: "Gmail read access to check your emails",
    },
  ],
  send_email: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.GMAIL_SEND],
      description: "Gmail send access to send emails",
    },
  ],
  list_calendar: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.CALENDAR_READONLY],
      description: "Google Calendar read access to view events",
    },
  ],
  create_calendar_event: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.CALENDAR_EVENTS],
      description: "Google Calendar write access to create events",
    },
  ],
  lookup_contact: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.CONTACTS_READONLY],
      description: "Google Contacts read access to find contacts",
    },
  ],
  text_contact: [
    {
      provider: "google",
      scopes: [GOOGLE_SCOPES.CONTACTS_READONLY],
      description: "Google Contacts read access to find the contact",
    },
    {
      provider: "blooio",
      description: "Blooio iMessage access to send the text",
    },
  ],
  send_sms: [
    {
      provider: "twilio",
      description: "Twilio SMS access to send text messages",
    },
  ],
};

class CredentialValidator {
  /**
   * Validate credentials for a specific workflow using database-driven requirements
   * Falls back to legacy hardcoded check if no database requirements exist
   */
  async validateForWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<ValidationResult> {
    try {
      // First, try to get requirements from database
      const dbRequirements =
        await workflowSecretRequirementsRepository.getByWorkflowId(workflowId);

      if (dbRequirements && dbRequirements.length > 0) {
        // Use database-driven validation
        logger.info("[CredentialValidator] Using database requirements", {
          workflowId,
          requirementsCount: dbRequirements.length,
        });

        const requirements: RequiredCredential[] = dbRequirements.map((req) => ({
          provider: req.provider as CredentialProvider,
          scopes: req.scopes ?? undefined,
          description: req.description,
        }));

        const result = await this.validate(organizationId, requirements);

        // Enrich missing credentials with additional info from DB
        result.missing = result.missing.map((missing) => {
          const dbReq = dbRequirements.find(
            (r) => r.provider === missing.provider,
          );
          return {
            ...missing,
            displayName: dbReq?.display_name || missing.provider,
            authUrl: dbReq?.auth_url || missing.authUrl,
            stepNumber: dbReq?.step_number ?? undefined,
          };
        });

        return result;
      }

      // Fall back to legacy hardcoded check
      return this.validateLegacy(organizationId, workflowId);
    } catch (error) {
      logger.error("[CredentialValidator] Database validation failed, falling back to legacy", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fall back to legacy on database error
      return this.validateLegacy(organizationId, workflowId);
    }
  }

  /**
   * Legacy validation using hardcoded WORKFLOW_CREDENTIALS
   */
  private async validateLegacy(
    organizationId: string,
    workflowId: string,
  ): Promise<ValidationResult> {
    const requirements = WORKFLOW_CREDENTIALS[workflowId];

    if (!requirements) {
      // Unknown workflow, assume no special credentials needed
      logger.warn("[CredentialValidator] Unknown workflow (legacy)", { workflowId });
      return { valid: true, missing: [] };
    }

    return this.validate(organizationId, requirements);
  }

  /**
   * Pre-flight validation for workflow execution
   * Validates all requirements before starting execution
   */
  async preflightValidation(
    organizationId: string,
    workflowId: string,
  ): Promise<ValidationResult> {
    const result = await this.validateForWorkflow(organizationId, workflowId);

    if (!result.valid) {
      // Mark as preflight failure for better error handling
      result.preflightFailure = true;
    }

    logger.info("[CredentialValidator] Preflight validation", {
      organizationId,
      workflowId,
      valid: result.valid,
      missingCount: result.missing.length,
      preflightFailure: result.preflightFailure,
    });

    return result;
  }

  /**
   * Validate a set of credential requirements
   */
  async validate(
    organizationId: string,
    requirements: RequiredCredential[],
  ): Promise<ValidationResult> {
    const missing: MissingCredential[] = [];

    for (const req of requirements) {
      const hasCredential = await this.checkCredential(
        organizationId,
        req.provider,
        req.scopes,
      );

      if (!hasCredential) {
        missing.push({
          provider: req.provider,
          scopes: req.scopes,
          description: req.description,
          authUrl: this.getAuthUrl(req.provider),
        });
      }
    }

    logger.info("[CredentialValidator] Validation complete", {
      organizationId,
      requirementsCount: requirements.length,
      missingCount: missing.length,
      valid: missing.length === 0,
    });

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Check if a specific credential is available
   */
  private async checkCredential(
    organizationId: string,
    provider: CredentialProvider,
    scopes?: string[],
  ): Promise<boolean> {
    switch (provider) {
      case "google": {
        try {
          const status =
            await googleAutomationService.getConnectionStatus(organizationId);
          if (!status.connected) return false;

          // If specific scopes required, check them
          if (scopes && scopes.length > 0) {
            const hasAllScopes = scopes.every(
              (scope) => status.scopes?.includes(scope) || false,
            );
            return hasAllScopes;
          }

          return true;
        } catch {
          return false;
        }
      }

      case "blooio": {
        try {
          const status =
            await blooioAutomationService.getConnectionStatus(organizationId);
          return status.connected;
        } catch {
          return false;
        }
      }

      case "twilio": {
        try {
          const status =
            await twilioAutomationService.getConnectionStatus(organizationId);
          return status.connected;
        } catch {
          return false;
        }
      }

      case "notion": {
        // Notion not implemented yet
        logger.debug("[CredentialValidator] Notion validation not implemented");
        return false;
      }

      case "telegram": {
        // Telegram - check if bot token is configured
        return !!process.env.TELEGRAM_BOT_TOKEN;
      }

      default:
        logger.warn("[CredentialValidator] Unknown provider", { provider });
        return false;
    }
  }

  /**
   * Get the auth URL for a provider
   */
  private getAuthUrl(provider: CredentialProvider): string {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    switch (provider) {
      case "google":
        return `${baseUrl}/dashboard/settings?tab=connections&connect=google`;
      case "blooio":
        return `${baseUrl}/dashboard/settings?tab=connections&connect=blooio`;
      case "twilio":
        return `${baseUrl}/dashboard/settings?tab=connections&connect=twilio`;
      case "notion":
        return `${baseUrl}/dashboard/settings?tab=connections&connect=notion`;
      case "telegram":
        return `${baseUrl}/dashboard/settings?tab=connections&connect=telegram`;
      default:
        return `${baseUrl}/dashboard/settings?tab=connections`;
    }
  }

  /**
   * Get display name for a provider
   */
  getProviderDisplayName(provider: CredentialProvider): string {
    const displayNames: Record<CredentialProvider, string> = {
      google: "Google",
      blooio: "Blooio iMessage",
      twilio: "Twilio SMS",
      notion: "Notion",
      telegram: "Telegram",
    };
    return displayNames[provider] || provider;
  }

  /**
   * Get human-readable prompt for missing credentials
   */
  formatMissingCredentialsMessage(missing: MissingCredential[]): string {
    if (missing.length === 0) {
      return "";
    }

    if (missing.length === 1) {
      const displayName = missing[0].displayName || this.getProviderDisplayName(missing[0].provider);
      return `To do this, I need access to ${missing[0].description}. Would you like to connect your ${displayName} account?`;
    }

    const descriptions = missing.map((m) => m.description);
    const lastDesc = descriptions.pop();

    return `To do this, I need access to ${descriptions.join(", ")} and ${lastDesc}. Would you like to connect these accounts?`;
  }

  /**
   * Format validation result for API response
   */
  formatForResponse(result: ValidationResult): {
    valid: boolean;
    preflightFailure?: boolean;
    missingCredentials?: Array<{
      provider: string;
      displayName: string;
      description: string;
      connectUrl: string;
      stepNumber?: number;
    }>;
    suggestion?: string;
  } {
    if (result.valid) {
      return { valid: true };
    }

    return {
      valid: false,
      preflightFailure: result.preflightFailure,
      missingCredentials: result.missing.map((m) => ({
        provider: m.provider,
        displayName: m.displayName || this.getProviderDisplayName(m.provider),
        description: m.description,
        connectUrl: m.authUrl || this.getAuthUrl(m.provider),
        stepNumber: m.stepNumber,
      })),
      suggestion: this.formatMissingCredentialsMessage(result.missing),
    };
  }
}

export const credentialValidator = new CredentialValidator();
