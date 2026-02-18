"use client";

import { TelegramConnection } from "../telegram-connection";
import { DiscordGatewayConnection } from "../discord-gateway-connection";
import { GoogleConnection } from "../google-connection";
import { MicrosoftConnection } from "../microsoft-connection";
import { BlooioConnection } from "../blooio-connection";
import { TwilioConnection } from "../twilio-connection";
import { TwitterConnection } from "../twitter-connection";
import { GenericOAuthConnection } from "../generic-oauth-connection";
import { PROVIDER_CATEGORIES } from "../connection-providers";

export function ConnectionsTab() {
  return (
    <div className="space-y-8">
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
          <MicrosoftConnection />
          <TwilioConnection />
          <BlooioConnection />
        </div>
      </div>

      {/* Social Media Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Social Media Connections
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect your social accounts to enable AI-powered conversations and
            automation.
          </p>
        </div>

        <div className="grid gap-4">
          <DiscordGatewayConnection />
          <TelegramConnection />
          <TwitterConnection />
        </div>
      </div>

      {/* Dynamic MCP provider sections */}
      {PROVIDER_CATEGORIES.map((category) => (
        <div key={category.title} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {category.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {category.description}
            </p>
          </div>

          <div className="grid gap-4">
            {category.providers.map((provider) => (
              <GenericOAuthConnection
                key={provider.id}
                platformId={provider.id}
                platformName={provider.name}
                description={provider.description}
                icon={provider.icon}
                features={provider.features}
                accentColor={provider.accentColor}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
