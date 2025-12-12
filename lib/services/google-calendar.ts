/**
 * Google Calendar Service
 * 
 * Creates calendar events for tasks with due dates.
 */

import { logger } from "@/lib/utils/logger";
import { platformCredentialsService } from "@/lib/services/platform-credentials";

interface CreateEventParams {
  organizationId: string;
  userId: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  reminders?: { minutes: number }[];
}

interface CalendarEvent {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
}

class GoogleCalendarService {
  private async getAccessToken(organizationId: string, userId: string): Promise<string | null> {
    // Get Google credentials (google_calendar uses the base google OAuth)
    const credentials = await platformCredentialsService.listCredentials(organizationId, {
      platform: "google",
      status: "active",
    });

    // Find credentials for this user or any user with calendar scope
    const calendarCreds = credentials.find(
      (c) => c.user_id === userId && (c.scopes as string[])?.includes("https://www.googleapis.com/auth/calendar")
    ) ?? credentials.find((c) => (c.scopes as string[])?.includes("https://www.googleapis.com/auth/calendar"));

    if (!calendarCreds) return null;

    // Check if token needs refresh
    if (calendarCreds.token_expires_at && new Date(calendarCreds.token_expires_at) < new Date()) {
      const refreshed = await platformCredentialsService.refreshToken(calendarCreds.id, organizationId);
      if (!refreshed) return null;
    }

    const result = await platformCredentialsService.getCredentialWithTokens(calendarCreds.id, organizationId);
    return result?.accessToken ?? null;
  }

  async createEvent(params: CreateEventParams): Promise<{ success: boolean; event?: CalendarEvent; error?: string }> {
    const { organizationId, userId, summary, description, startTime, endTime, reminders } = params;

    const accessToken = await this.getAccessToken(organizationId, userId);
    if (!accessToken) {
      return { success: false, error: "Google Calendar not connected" };
    }

    const eventEndTime = endTime ?? new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

    const event = {
      summary,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: eventEndTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: reminders
        ? {
            useDefault: false,
            overrides: reminders.map((r) => ({
              method: "popup",
              minutes: r.minutes,
            })),
          }
        : { useDefault: true },
    };

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error("[GoogleCalendarService] Failed to create event", { error });
      return { success: false, error: `Calendar API error: ${response.status}` };
    }

    const data = await response.json() as CalendarEvent;
    logger.info("[GoogleCalendarService] Event created", { eventId: data.id, summary });

    return { success: true, event: data };
  }

  async isConnected(organizationId: string, userId: string): Promise<boolean> {
    const token = await this.getAccessToken(organizationId, userId);
    return token !== null;
  }
}

export const googleCalendarService = new GoogleCalendarService();
