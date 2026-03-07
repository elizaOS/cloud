"use client";

import { DashboardSection } from "@/components/brand";
import { TelegramConnection } from "../telegram-connection";
import { DiscordGatewayConnection } from "../discord-gateway-connection";
import { GoogleConnection } from "../google-connection";
import { MicrosoftConnection } from "../microsoft-connection";
import { BlooioConnection } from "../blooio-connection";
import { TwilioConnection } from "../twilio-connection";

export function ConnectionsTab() {
  return (
    <div className="space-y-8">
      {/* Messaging & Communication Section */}
      <div className="space-y-4">
        <DashboardSection
          label="Connections"
          title="Messaging & Communication"
          description="Connect messaging services for AI-powered conversations via SMS, iMessage, and email."
        />

        <div className="grid gap-4">
          <GoogleConnection />
          <MicrosoftConnection />
          <TwilioConnection />
          <BlooioConnection />
        </div>
      </div>

      {/* Social Media Section */}
      <div className="space-y-4">
        <DashboardSection
          label="Channels"
          title="Social Media Connections"
          description="Connect your social accounts to enable AI-powered conversations."
        />

        <div className="grid gap-4">
          <DiscordGatewayConnection />
          <TelegramConnection />
        </div>
      </div>
    </div>
  );
}
