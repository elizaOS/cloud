/**
 * Twilio SMS Service
 * 
 * Sends SMS messages for task reminders and notifications.
 */

import { logger } from "@/lib/utils/logger";
import { secretsService } from "@/lib/services/secrets";

interface SendSmsParams {
  to: string;
  body: string;
  organizationId: string;
}

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

class TwilioService {
  private async getCredentials(organizationId: string): Promise<TwilioCredentials | null> {
    const [accountSid, authToken, fromNumber] = await Promise.all([
      secretsService.getSecret(organizationId, "TWILIO_ACCOUNT_SID"),
      secretsService.getSecret(organizationId, "TWILIO_AUTH_TOKEN"),
      secretsService.getSecret(organizationId, "TWILIO_FROM_NUMBER"),
    ]);

    if (!accountSid || !authToken || !fromNumber) {
      return null;
    }

    return { accountSid, authToken, fromNumber };
  }

  async sendSms(params: SendSmsParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, body, organizationId } = params;

    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      return { success: false, error: "Twilio credentials not configured" };
    }

    const { accountSid, authToken, fromNumber } = credentials;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: body,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error("[TwilioService] Failed to send SMS", { error });
      return { success: false, error: `Twilio API error: ${response.status}` };
    }

    const data = await response.json() as { sid: string };
    logger.info("[TwilioService] SMS sent", { messageId: data.sid, to });
    
    return { success: true, messageId: data.sid };
  }

  async isConfigured(organizationId: string): Promise<boolean> {
    const credentials = await this.getCredentials(organizationId);
    return credentials !== null;
  }
}

export const twilioService = new TwilioService();

