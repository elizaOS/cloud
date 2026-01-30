/**
 * Plugin OAuth
 *
 * OAuth toolkit for ElizaOS agents.
 * Enables users to connect/manage OAuth platforms (Google, Twitter, etc.) through chat.
 */

import type { Plugin } from "@elizaos/core";
import { oauthConnectAction } from "./actions/oauth-connect";
import { oauthListAction } from "./actions/oauth-list";
import { oauthGetAction } from "./actions/oauth-get";
import { oauthRevokeAction } from "./actions/oauth-revoke";
import { userAuthStatusProvider } from "./providers/user-auth-status";

export const oauthPlugin: Plugin = {
  name: "oauth",
  description: "OAuth toolkit - connect and manage OAuth platforms through chat",

  actions: [
    oauthConnectAction,
    oauthListAction,
    oauthGetAction,
    oauthRevokeAction,
  ],

  providers: [userAuthStatusProvider],
};

export default oauthPlugin;

export { oauthConnectAction } from "./actions/oauth-connect";
export { oauthListAction } from "./actions/oauth-list";
export { oauthGetAction } from "./actions/oauth-get";
export { oauthRevokeAction } from "./actions/oauth-revoke";
export { userAuthStatusProvider } from "./providers/user-auth-status";
