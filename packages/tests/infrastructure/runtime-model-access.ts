/**
 * Runtime message tests call the live AI Gateway via runtime.useModel().
 * Skip those suites unless the runtime has the gateway credentials it actually uses.
 */

export const hasRuntimeModelCredentials = Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY,
);
