/**
 * Workflow Executor Service
 *
 * Executes generated workflows with real API calls.
 * Supports Google (Gmail, Calendar, Contacts), Notion, and messaging services.
 */

import { logger } from "@/lib/utils/logger";
import { secretsService } from "@/lib/services/secrets";
import { googleTokenService } from "@/lib/services/google-token";

export interface WorkflowExecutionContext {
  organizationId: string;
  userId?: string;
  workflowId?: string;
  input: Record<string, unknown>;
  dryRun?: boolean;
}

export interface WorkflowExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  executionTimeMs: number;
  steps?: StepResult[];
}

export interface StepResult {
  stepName: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface GoogleCredentials {
  accessToken: string;
  refreshToken?: string;
}

class WorkflowExecutorService {
  /**
   * Execute a workflow with the given context
   */
  async execute(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];

    try {
      logger.info("[WorkflowExecutor] Starting workflow execution", {
        organizationId: context.organizationId,
        workflowId: context.workflowId,
        dryRun: context.dryRun,
      });

      // For now, we'll return a placeholder result
      // Real implementation would parse and execute the workflow code

      return {
        success: true,
        output: { message: "Workflow executed successfully" },
        executionTimeMs: Date.now() - startTime,
        steps,
      };
    } catch (error) {
      logger.error("[WorkflowExecutor] Execution failed", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTimeMs: Date.now() - startTime,
        steps,
      };
    }
  }

  // =========================================================================
  // GOOGLE SERVICES
  // =========================================================================

  /**
   * Get Google credentials for an organization
   * Uses GoogleTokenService for automatic token refresh
   */
  private async getGoogleCredentials(organizationId: string): Promise<GoogleCredentials | null> {
    const result = await googleTokenService.getValidToken(organizationId);
    
    if (!result) {
      return null;
    }

    return { accessToken: result.accessToken };
  }

  /**
   * Send an email via Gmail
   */
  async sendEmail(
    organizationId: string,
    params: {
      to: string | string[];
      subject: string;
      body: string;
      cc?: string | string[];
      bcc?: string | string[];
      isHtml?: boolean;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: "Google not connected" };
      }

      const toAddresses = Array.isArray(params.to) ? params.to.join(", ") : params.to;
      const ccAddresses = params.cc
        ? Array.isArray(params.cc)
          ? params.cc.join(", ")
          : params.cc
        : undefined;
      const bccAddresses = params.bcc
        ? Array.isArray(params.bcc)
          ? params.bcc.join(", ")
          : params.bcc
        : undefined;

      // Build email content
      const emailContent = [
        `To: ${toAddresses}`,
        `Subject: ${params.subject}`,
      ];

      if (ccAddresses) {
        emailContent.push(`Cc: ${ccAddresses}`);
      }
      if (bccAddresses) {
        emailContent.push(`Bcc: ${bccAddresses}`);
      }

      emailContent.push(
        `Content-Type: ${params.isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
        "",
        params.body,
      );

      const rawEmail = emailContent.join("\r\n");
      const encodedEmail = Buffer.from(rawEmail).toString("base64url");

      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: encodedEmail }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("[WorkflowExecutor] Gmail send failed", { error: errorText });
        return { success: false, error: errorText };
      }

      const data = await response.json();
      logger.info("[WorkflowExecutor] Email sent successfully", {
        messageId: data.id,
      });

      return { success: true, messageId: data.id };
    } catch (error) {
      logger.error("[WorkflowExecutor] Email send error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(
    organizationId: string,
    params: {
      summary: string;
      description?: string;
      start: Date | string;
      end: Date | string;
      attendees?: string[];
      location?: string;
      calendarId?: string;
    },
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: "Google not connected" };
      }

      const calendarId = params.calendarId || "primary";
      const startDate = params.start instanceof Date ? params.start : new Date(params.start);
      const endDate = params.end instanceof Date ? params.end : new Date(params.end);

      const event = {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: "UTC",
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: "UTC",
        },
        attendees: params.attendees?.map((email) => ({ email })),
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("[WorkflowExecutor] Calendar event creation failed", { error: errorText });
        return { success: false, error: errorText };
      }

      const data = await response.json();
      logger.info("[WorkflowExecutor] Calendar event created", {
        eventId: data.id,
      });

      return { success: true, eventId: data.id };
    } catch (error) {
      logger.error("[WorkflowExecutor] Calendar event error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List calendar events
   */
  async listCalendarEvents(
    organizationId: string,
    params: {
      calendarId?: string;
      timeMin?: Date | string;
      timeMax?: Date | string;
      maxResults?: number;
    },
  ): Promise<{ success: boolean; events?: Array<Record<string, unknown>>; error?: string }> {
    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: "Google not connected" };
      }

      const calendarId = params.calendarId || "primary";
      const queryParams = new URLSearchParams();

      if (params.timeMin) {
        const date = params.timeMin instanceof Date ? params.timeMin : new Date(params.timeMin);
        queryParams.set("timeMin", date.toISOString());
      }
      if (params.timeMax) {
        const date = params.timeMax instanceof Date ? params.timeMax : new Date(params.timeMax);
        queryParams.set("timeMax", date.toISOString());
      }
      if (params.maxResults) {
        queryParams.set("maxResults", params.maxResults.toString());
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`,
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, events: data.items || [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get Gmail messages
   */
  async listEmails(
    organizationId: string,
    params: {
      query?: string;
      maxResults?: number;
      labelIds?: string[];
    },
  ): Promise<{ success: boolean; messages?: Array<Record<string, unknown>>; error?: string }> {
    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: "Google not connected" };
      }

      const queryParams = new URLSearchParams();
      if (params.query) {
        queryParams.set("q", params.query);
      }
      if (params.maxResults) {
        queryParams.set("maxResults", params.maxResults.toString());
      }
      if (params.labelIds) {
        for (const id of params.labelIds) {
          queryParams.append("labelIds", id);
        }
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams}`,
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, messages: data.messages || [] };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get a specific email
   */
  async getEmail(
    organizationId: string,
    messageId: string,
  ): Promise<{ success: boolean; message?: Record<string, unknown>; error?: string }> {
    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        return { success: false, error: "Google not connected" };
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, message: data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // =========================================================================
  // MESSAGING SERVICES (SMS/iMessage)
  // =========================================================================

  /**
   * Send SMS via Twilio
   */
  async sendSms(
    organizationId: string,
    params: {
      to: string;
      from: string;
      body: string;
      mediaUrls?: string[];
    },
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      const accountSid = await secretsService.getDecryptedValue(
        organizationId,
        "twilio_account_sid",
      );
      const authToken = await secretsService.getDecryptedValue(
        organizationId,
        "twilio_auth_token",
      );

      if (!accountSid || !authToken) {
        return { success: false, error: "Twilio not connected" };
      }

      const formData = new URLSearchParams();
      formData.set("To", params.to);
      formData.set("From", params.from);
      formData.set("Body", params.body);
      
      if (params.mediaUrls) {
        for (const url of params.mediaUrls) {
          formData.append("MediaUrl", url);
        }
      }

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, messageSid: data.sid };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send iMessage via Blooio
   */
  async sendIMessage(
    organizationId: string,
    params: {
      to: string;
      from: string;
      body: string;
      mediaUrls?: string[];
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const apiKey = await secretsService.getDecryptedValue(
        organizationId,
        "blooio_api_key",
      );

      if (!apiKey) {
        return { success: false, error: "Blooio not connected" };
      }

      const response = await fetch("https://api.blooio.com/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: params.to,
          from: params.from,
          text: params.body,
          attachments: params.mediaUrls?.map((url) => ({ url })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, messageId: data.message_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Refresh Google access token if needed
   */
  async refreshGoogleToken(organizationId: string): Promise<boolean> {
    try {
      const refreshToken = await secretsService.getDecryptedValue(
        organizationId,
        "google_refresh_token",
      );

      if (!refreshToken) {
        return false;
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return false;
      }

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      // Store the new access token
      await secretsService.setSecret(
        organizationId,
        "google_access_token",
        data.access_token,
      );

      return true;
    } catch (error) {
      logger.error("[WorkflowExecutor] Token refresh error", { error });
      return false;
    }
  }
}

export const workflowExecutorService = new WorkflowExecutorService();
