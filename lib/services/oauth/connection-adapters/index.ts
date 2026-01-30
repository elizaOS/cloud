/**
 * Connection Adapters
 *
 * Adapters abstract storage differences between platforms:
 * - Google uses platform_credentials table
 * - Twitter, Twilio, Blooio use secrets table with naming patterns
 */

import type { OAuthConnection, TokenResult } from "../types";

export interface ConnectionAdapter {
  platform: string;
  listConnections(organizationId: string): Promise<OAuthConnection[]>;
  getToken(organizationId: string, connectionId: string): Promise<TokenResult>;
  revoke(organizationId: string, connectionId: string): Promise<void>;
  ownsConnection(connectionId: string): Promise<boolean>;
}

import { googleAdapter } from "./google-adapter";
import { twitterAdapter } from "./twitter-adapter";
import { twilioAdapter } from "./twilio-adapter";
import { blooioAdapter } from "./blooio-adapter";

const adapters: Record<string, ConnectionAdapter> = {
  google: googleAdapter,
  twitter: twitterAdapter,
  twilio: twilioAdapter,
  blooio: blooioAdapter,
};

export function getAdapter(platform: string): ConnectionAdapter | null {
  return adapters[platform] || null;
}

export function getAllAdapters(): ConnectionAdapter[] {
  return Object.values(adapters);
}
