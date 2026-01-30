/**
 * WhatsApp Automation Service
 *
 * Handles WhatsApp messaging via Twilio's WhatsApp Business API.
 * Leverages existing Twilio credentials with WhatsApp-specific configuration.
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

// Secret names for WhatsApp-specific configuration
const SECRET_NAMES = {
  WHATSAPP_NUMBER: "WHATSAPP_PHONE_NUMBER", // WhatsApp-enabled Twilio number
  WHATSAPP_ENABLED: "WHATSAPP_ENABLED", // Flag to indicate WhatsApp is configured
};

// Twilio secret names (reused from twilio-automation)
const TWILIO_SECRET_NAMES = {
  ACCOUNT_SID: "TWILIO_ACCOUNT_SID",
  AUTH_TOKEN: "TWILIO_AUTH_TOKEN",
};

// Cache for status checks (5 minute TTL)
const statusCache = new Map<
  string,
  { status: WhatsAppConnectionStatus; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

export interface WhatsAppConnectionStatus {
  configured: boolean; // Twilio is configured
  connected: boolean; // WhatsApp number is set up
  phoneNumber?: string;
  twilioConnected?: boolean;
  error?: string;
}

class WhatsAppAutomationService {
  /**
   * Check if Twilio is configured (required for WhatsApp)
   */
  async isTwilioConfigured(organizationId: string): Promise<boolean> {
    try {
      const accountSid = await secretsService.getByName(
        organizationId,
        TWILIO_SECRET_NAMES.ACCOUNT_SID
      );
      const authToken = await secretsService.getByName(
        organizationId,
        TWILIO_SECRET_NAMES.AUTH_TOKEN
      );
      return Boolean(accountSid && authToken);
    } catch {
      return false;
    }
  }

  /**
   * Store WhatsApp configuration
   */
  async storeCredentials(
    organizationId: string,
    userId: string,
    phoneNumber: string
  ): Promise<void> {
    const audit = {
      action: "whatsapp_connect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { phoneNumber },
    };

    // Remove existing WhatsApp config first
    await this.removeCredentials(organizationId, userId);

    // Store WhatsApp phone number
    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.WHATSAPP_NUMBER,
        value: phoneNumber,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    // Mark WhatsApp as enabled
    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.WHATSAPP_ENABLED,
        value: "true",
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Remove WhatsApp configuration
   */
  async removeCredentials(
    organizationId: string,
    userId: string
  ): Promise<void> {
    const audit = {
      action: "whatsapp_disconnect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: {},
    };

    for (const secretName of Object.values(SECRET_NAMES)) {
      try {
        await secretsService.deleteByName(organizationId, secretName, audit);
      } catch {
        // Ignore if doesn't exist
      }
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(
    organizationId: string
  ): Promise<WhatsAppConnectionStatus> {
    // Check cache
    const cached = statusCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status;
    }

    try {
      // Check if Twilio is connected
      const twilioConnected = await this.isTwilioConfigured(organizationId);

      if (!twilioConnected) {
        const status: WhatsAppConnectionStatus = {
          configured: false,
          connected: false,
          twilioConnected: false,
          error: "Twilio must be connected first",
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      // Check WhatsApp configuration
      const whatsappNumber = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WHATSAPP_NUMBER
      );
      const whatsappEnabled = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WHATSAPP_ENABLED
      );

      const connected = Boolean(whatsappNumber && whatsappEnabled === "true");

      const status: WhatsAppConnectionStatus = {
        configured: true,
        connected,
        twilioConnected: true,
        phoneNumber: whatsappNumber || undefined,
      };

      statusCache.set(organizationId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      logger.error("[WhatsApp] Error getting connection status:", error);
      return {
        configured: false,
        connected: false,
        error: "Failed to check connection status",
      };
    }
  }

  /**
   * Send a WhatsApp message via Twilio
   */
  async sendMessage(
    organizationId: string,
    to: string,
    body: string,
    mediaUrl?: string
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      // Get Twilio credentials
      const accountSid = await secretsService.getByName(
        organizationId,
        TWILIO_SECRET_NAMES.ACCOUNT_SID
      );
      const authToken = await secretsService.getByName(
        organizationId,
        TWILIO_SECRET_NAMES.AUTH_TOKEN
      );
      const fromNumber = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WHATSAPP_NUMBER
      );

      if (!accountSid || !authToken || !fromNumber) {
        return { success: false, error: "WhatsApp not configured" };
      }

      // Format numbers for WhatsApp
      const whatsappFrom = `whatsapp:${fromNumber}`;
      const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

      // Send via Twilio API
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: whatsappFrom,
            To: whatsappTo,
            Body: body,
            ...(mediaUrl ? { MediaUrl: mediaUrl } : {}),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        logger.error("[WhatsApp] Failed to send message:", data);
        return { success: false, error: data.message || "Failed to send" };
      }

      return { success: true, messageSid: data.sid };
    } catch (error) {
      logger.error("[WhatsApp] Error sending message:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send message",
      };
    }
  }

  /**
   * Invalidate cached status
   */
  invalidateStatusCache(organizationId: string): void {
    statusCache.delete(organizationId);
  }
}

export const whatsappAutomationService = new WhatsAppAutomationService();
