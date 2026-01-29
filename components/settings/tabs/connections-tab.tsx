"use client";

import { TwitterConnection } from "../twitter-connection";
import { TelegramConnection } from "../telegram-connection";
import { DiscordConnection } from "../discord-connection";
import { GoogleConnection } from "../google-connection";
import { BlooioConnection } from "../blooio-connection";
import { TwilioConnection } from "../twilio-connection";

export function ConnectionsTab() {
  return (
    <div className="space-y-8">
      {/* Social Media Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Social Media Connections
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect your social accounts to enable AI-powered automation and
            cross-platform posting.
          </p>
        </div>

        <div className="grid gap-4">
          <TwitterConnection />
          <TelegramConnection />
          <DiscordConnection />
        </div>
      </div>

      {/* Messaging & Communication Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Messaging & Communication
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect messaging services for AI-powered conversations via SMS,
            iMessage, and email.
          </p>
        </div>

        <div className="grid gap-4">
          <GoogleConnection />
          <TwilioConnection />
          <BlooioConnection />
        </div>
      </div>
    </div>
  );
}
