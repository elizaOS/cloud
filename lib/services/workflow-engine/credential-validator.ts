/**
 * Credential Validator
 *
 * Validates that users have the required OAuth credentials before
 * executing workflows. Returns missing credentials with auth URLs
 * so users can be prompted to connect.
 */

import { googleAutomationService } from "@/lib/services/google-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";
import { GOOGLE_SCOPES } from "@/lib/utils/google-api";
import { logger } from "@/lib/utils/logger";

export type CredentialProvider = "google" | "blooio" | "twilio";

export interface RequiredCredential {
  provider: CredentialProvider;
  scopes?: string[];
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: MissingCredential[];
}

export interface MissingCredential {
  provider: CredentialProvider;
  scopes?: string[];
  description: string;
  authUrl?: string;
}

/**
 * Workflow credential requirements
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
   * Validate credentials for a specific workflow
   */
  async validateForWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<ValidationResult> {
    const requirements = WORKFLOW_CREDENTIALS[workflowId];

    if (!requirements) {
      // Unknown workflow, assume no special credentials needed
      logger.warn("[CredentialValidator] Unknown workflow", { workflowId });
      return { valid: true, missing: [] };
    }

    return this.validate(organizationId, requirements);
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
      }

      case "blooio": {
        const status =
          await blooioAutomationService.getConnectionStatus(organizationId);
        return status.connected;
      }

      case "twilio": {
        const status =
          await twilioAutomationService.getConnectionStatus(organizationId);
        return status.connected;
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
      default:
        return `${baseUrl}/dashboard/settings?tab=connections`;
    }
  }

  /**
   * Get human-readable prompt for missing credentials
   */
  formatMissingCredentialsMessage(missing: MissingCredential[]): string {
    if (missing.length === 0) {
      return "";
    }

    if (missing.length === 1) {
      return `To do this, I need access to ${missing[0].description}. Would you like to connect your ${missing[0].provider} account?`;
    }

    const descriptions = missing.map((m) => m.description);
    const lastDesc = descriptions.pop();

    return `To do this, I need access to ${descriptions.join(", ")} and ${lastDesc}. Would you like to connect these accounts?`;
  }
}

export const credentialValidator = new CredentialValidator();
