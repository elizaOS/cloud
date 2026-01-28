/**
 * Workflow Executor Service
 *
 * Executes generated workflows with real API calls.
 * Supports Google (Gmail, Calendar, Contacts), Notion, and messaging services.
 *
 * Includes pre-flight validation to check credentials before execution,
 * returning actionable errors if credentials are missing.
 */

import { logger } from "@/lib/utils/logger";
import { secretsService } from "@/lib/services/secrets";
import { googleTokenService } from "@/lib/services/google-token";
import { credentialValidator, type MissingCredential } from "@/lib/services/workflow-engine/credential-validator";

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
  preflightFailure?: boolean;
  missingCredentials?: MissingCredential[];
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

/**
 * Execution plan step from workflow
 */
export interface ExecutionPlanStep {
  step: number;
  serviceId: string;
  operation: string;
}

/**
 * Action execution result
 */
export interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

class WorkflowExecutorService {
  /**
   * Execute a workflow with the given execution plan
   */
  async execute(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];

    try {
      logger.info(
        "[WorkflowExecutor] ========== STARTING WORKFLOW EXECUTION ==========",
        {
          organizationId: context.organizationId,
          workflowId: context.workflowId,
          dryRun: context.dryRun,
          inputKeys: Object.keys(context.input),
        },
      );

      // If no execution plan provided in input, return early
      const executionPlan = context.input.executionPlan as
        | ExecutionPlanStep[]
        | undefined;

      logger.info("[WorkflowExecutor] Execution plan received", {
        hasExecutionPlan: !!executionPlan,
        stepCount: executionPlan?.length || 0,
        plan: executionPlan,
      });

      if (!executionPlan || executionPlan.length === 0) {
        logger.warn(
          "[WorkflowExecutor] No execution plan provided, returning early",
        );
        return {
          success: true,
          output: { message: "No execution plan provided" },
          executionTimeMs: Date.now() - startTime,
          steps,
        };
      }

      // Pre-flight validation: Check credentials before starting execution
      if (context.workflowId && !context.dryRun) {
        logger.info("[WorkflowExecutor] Running pre-flight validation", {
          workflowId: context.workflowId,
        });

        const validation = await credentialValidator.preflightValidation(
          context.organizationId,
          context.workflowId,
        );

        if (!validation.valid) {
          logger.warn("[WorkflowExecutor] Pre-flight validation failed", {
            workflowId: context.workflowId,
            missingCount: validation.missing.length,
            missingProviders: validation.missing.map((m) => m.provider),
          });

          return {
            success: false,
            error: "Missing required credentials",
            preflightFailure: true,
            missingCredentials: validation.missing,
            executionTimeMs: Date.now() - startTime,
            steps: [],
          };
        }

        logger.info("[WorkflowExecutor] Pre-flight validation passed", {
          workflowId: context.workflowId,
        });
      }

      // Execute each step in sequence
      let previousStepOutput: Record<string, unknown> =
        (context.input.params as Record<string, unknown>) || {};

      for (const planStep of executionPlan) {
        const stepStartTime = Date.now();

        logger.info("[WorkflowExecutor] Executing step", {
          step: planStep.step,
          serviceId: planStep.serviceId,
          operation: planStep.operation,
        });

        if (context.dryRun) {
          // In dry run mode, just log what would happen
          steps.push({
            stepName: `${planStep.serviceId}.${planStep.operation}`,
            success: true,
            output: { dryRun: true, wouldExecute: planStep },
            durationMs: Date.now() - stepStartTime,
          });
          continue;
        }

        // Execute the action
        const actionResult = await this.executeAction(
          context.organizationId,
          planStep.serviceId,
          planStep.operation,
          previousStepOutput,
        );

        steps.push({
          stepName: `${planStep.serviceId}.${planStep.operation}`,
          success: actionResult.success,
          output: actionResult.data,
          error: actionResult.error,
          durationMs: Date.now() - stepStartTime,
        });

        if (!actionResult.success) {
          // Stop execution on first failure
          return {
            success: false,
            error: `Step ${planStep.step} failed: ${actionResult.error}`,
            executionTimeMs: Date.now() - startTime,
            steps,
          };
        }

        // Pass output to next step
        previousStepOutput = { ...previousStepOutput, ...actionResult.data };
      }

      return {
        success: true,
        output: previousStepOutput,
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

  /**
   * Normalize operation name to match our switch cases
   * Handles formats like "calendar.list_events" -> "listCalendarEvents"
   */
  private normalizeOperation(serviceId: string, operation: string): string {
    // Map from dependency resolver format to executor format
    const operationMap: Record<string, string> = {
      // Google Calendar
      "google.calendar.list_events": "google.listCalendarEvents",
      "google.calendar.create_event": "google.createCalendarEvent",
      "google.calendar_list_events": "google.listCalendarEvents",
      "google.calendar_create_event": "google.createCalendarEvent",
      // Google Gmail
      "google.gmail.send_email": "google.sendEmail",
      "google.gmail.list_emails": "google.listEmails",
      "google.gmail.get_email": "google.getEmail",
      "google.gmail_send_email": "google.sendEmail",
      "google.gmail_list_emails": "google.listEmails",
      // Twilio
      "twilio.sms.send": "twilio.sendSms",
      "twilio.send_sms": "twilio.sendSms",
      // Blooio
      "blooio.imessage.send": "blooio.sendIMessage",
      "blooio.send_imessage": "blooio.sendIMessage",
    };

    const key = `${serviceId}.${operation}`;
    const normalized = operationMap[key] || key;

    if (normalized !== key) {
      logger.info("[WorkflowExecutor] Normalized operation name", {
        original: key,
        normalized,
      });
    }

    return normalized;
  }

  /**
   * Execute a single action based on service and operation
   */
  async executeAction(
    organizationId: string,
    serviceId: string,
    operation: string,
    params: Record<string, unknown>,
  ): Promise<ActionResult> {
    // Normalize the operation name to handle different formats
    const normalizedOp = this.normalizeOperation(serviceId, operation);

    logger.info("[WorkflowExecutor] Executing action", {
      organizationId,
      serviceId,
      operation,
      normalizedOperation: normalizedOp,
      paramKeys: Object.keys(params),
    });

    try {
      switch (normalizedOp) {
        // Google Gmail operations
        case "google.sendEmail": {
          const emailResult = await this.sendEmail(organizationId, {
            to: params.to as string | string[],
            subject: params.subject as string,
            body: params.body as string,
            cc: params.cc as string | string[] | undefined,
            bcc: params.bcc as string | string[] | undefined,
            isHtml: params.isHtml as boolean | undefined,
          });
          return {
            success: emailResult.success,
            data: emailResult.messageId
              ? { messageId: emailResult.messageId }
              : undefined,
            error: emailResult.error,
          };
        }

        case "google.listEmails": {
          const listEmailsResult = await this.listEmails(organizationId, {
            query: params.query as string | undefined,
            maxResults: params.maxResults as number | undefined,
            labelIds: params.labelIds as string[] | undefined,
          });
          return {
            success: listEmailsResult.success,
            data: listEmailsResult.messages
              ? { messages: listEmailsResult.messages }
              : undefined,
            error: listEmailsResult.error,
          };
        }

        case "google.getEmail": {
          const getEmailResult = await this.getEmail(
            organizationId,
            params.messageId as string,
          );
          return {
            success: getEmailResult.success,
            data: getEmailResult.message
              ? { message: getEmailResult.message }
              : undefined,
            error: getEmailResult.error,
          };
        }

        // Google Calendar operations
        case "google.createCalendarEvent": {
          const calendarResult = await this.createCalendarEvent(
            organizationId,
            {
              summary: params.summary as string,
              description: params.description as string | undefined,
              start: params.start as Date | string,
              end: params.end as Date | string,
              attendees: params.attendees as string[] | undefined,
              location: params.location as string | undefined,
              calendarId: params.calendarId as string | undefined,
            },
          );
          return {
            success: calendarResult.success,
            data: calendarResult.eventId
              ? { eventId: calendarResult.eventId }
              : undefined,
            error: calendarResult.error,
          };
        }

        case "google.listCalendarEvents": {
          const listEventsResult = await this.listCalendarEvents(
            organizationId,
            {
              calendarId: params.calendarId as string | undefined,
              timeMin: params.timeMin as Date | string | undefined,
              timeMax: params.timeMax as Date | string | undefined,
              maxResults: params.maxResults as number | undefined,
            },
          );
          return {
            success: listEventsResult.success,
            data: listEventsResult.events
              ? { events: listEventsResult.events }
              : undefined,
            error: listEventsResult.error,
          };
        }

        // Twilio SMS operations
        case "twilio.sendSms": {
          const smsResult = await this.sendSms(organizationId, {
            to: params.to as string,
            from: params.from as string,
            body: params.body as string,
            mediaUrls: params.mediaUrls as string[] | undefined,
          });
          return {
            success: smsResult.success,
            data: smsResult.messageSid
              ? { messageSid: smsResult.messageSid }
              : undefined,
            error: smsResult.error,
          };
        }

        // Blooio iMessage operations
        case "blooio.sendIMessage": {
          const imessageResult = await this.sendIMessage(organizationId, {
            to: params.to as string,
            from: params.from as string,
            body: params.body as string,
            mediaUrls: params.mediaUrls as string[] | undefined,
          });
          return {
            success: imessageResult.success,
            data: imessageResult.messageId
              ? { messageId: imessageResult.messageId }
              : undefined,
            error: imessageResult.error,
          };
        }

        default:
          logger.error("[WorkflowExecutor] Unknown operation - not mapped", {
            serviceId,
            operation,
            normalizedOperation: normalizedOp,
            availableOperations: [
              "google.sendEmail",
              "google.listEmails",
              "google.getEmail",
              "google.createCalendarEvent",
              "google.listCalendarEvents",
              "twilio.sendSms",
              "blooio.sendIMessage",
            ],
          });
          return {
            success: false,
            error: `Unknown operation: ${serviceId}.${operation} (normalized: ${normalizedOp}). Check logs for available operations.`,
          };
      }
    } catch (error) {
      logger.error("[WorkflowExecutor] Action execution error", {
        serviceId,
        operation,
        normalizedOperation: normalizedOp,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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
  private async getGoogleCredentials(
    organizationId: string,
  ): Promise<GoogleCredentials | null> {
    logger.info("[WorkflowExecutor] Fetching Google credentials", {
      organizationId,
    });

    try {
      const result = await googleTokenService.getValidToken(organizationId);

      if (!result) {
        logger.error("[WorkflowExecutor] Google credentials NOT FOUND", {
          organizationId,
          reason: "googleTokenService.getValidToken returned null",
          hint: "Check platform_credentials table for Google entry with status='active'",
        });
        return null;
      }

      logger.info(
        "[WorkflowExecutor] Google credentials retrieved successfully",
        {
          organizationId,
          hasAccessToken: !!result.accessToken,
          tokenLength: result.accessToken?.length || 0,
          email: result.email,
          expiresAt: result.expiresAt,
        },
      );

      return { accessToken: result.accessToken };
    } catch (error) {
      logger.error("[WorkflowExecutor] Error fetching Google credentials", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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

      const toAddresses = Array.isArray(params.to)
        ? params.to.join(", ")
        : params.to;
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
      const emailContent = [`To: ${toAddresses}`, `Subject: ${params.subject}`];

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
        logger.error("[WorkflowExecutor] Gmail send failed", {
          error: errorText,
        });
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
      const startDate =
        params.start instanceof Date ? params.start : new Date(params.start);
      const endDate =
        params.end instanceof Date ? params.end : new Date(params.end);

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
        logger.error("[WorkflowExecutor] Calendar event creation failed", {
          error: errorText,
        });
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
  ): Promise<{
    success: boolean;
    events?: Array<Record<string, unknown>>;
    error?: string;
  }> {
    logger.info("[WorkflowExecutor] listCalendarEvents called", {
      organizationId,
      params,
    });

    try {
      const credentials = await this.getGoogleCredentials(organizationId);
      if (!credentials) {
        logger.error("[WorkflowExecutor] listCalendarEvents - No credentials", {
          organizationId,
        });
        return {
          success: false,
          error: "Google not connected - check OAuth connection in Settings",
        };
      }

      const calendarId = params.calendarId || "primary";
      const queryParams = new URLSearchParams();

      if (params.timeMin) {
        const date =
          params.timeMin instanceof Date
            ? params.timeMin
            : new Date(params.timeMin);
        queryParams.set("timeMin", date.toISOString());
      }
      if (params.timeMax) {
        const date =
          params.timeMax instanceof Date
            ? params.timeMax
            : new Date(params.timeMax);
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
  ): Promise<{
    success: boolean;
    messages?: Array<Record<string, unknown>>;
    error?: string;
  }> {
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
  ): Promise<{
    success: boolean;
    message?: Record<string, unknown>;
    error?: string;
  }> {
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
   * Uses Blooio API v2 endpoint: POST /chats/{chatId}/messages
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
      // Try secrets service first, then fall back to env var
      let apiKey = await secretsService.getDecryptedValue(
        organizationId,
        "BLOOIO_API_KEY",
      );

      if (!apiKey) {
        apiKey = process.env.BLOOIO_API_KEY || null;
      }

      if (!apiKey) {
        return { success: false, error: "Blooio not connected" };
      }

      // Get from number from secrets or env
      let fromNumber = await secretsService.getDecryptedValue(
        organizationId,
        "BLOOIO_FROM_NUMBER",
      );
      if (!fromNumber) {
        fromNumber = process.env.BLOOIO_FROM_NUMBER || params.from;
      }

      // Blooio v2 API: POST /chats/{chatId}/messages
      const chatId = encodeURIComponent(params.to);
      const response = await fetch(
        `https://backend.blooio.com/v2/api/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(fromNumber ? { "X-From-Number": fromNumber } : {}),
          },
          body: JSON.stringify({
            text: params.body,
            attachments: params.mediaUrls?.map((url) => ({ url })),
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Blooio API error (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.message_id || data.message_ids?.[0],
      };
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
