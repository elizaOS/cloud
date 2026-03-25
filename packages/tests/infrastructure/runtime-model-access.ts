/**
 * Runtime message tests call the live AI Gateway via runtime.useModel().
 * The default runtime path uses Vercel OIDC auth in local test runs.
 * Skip those suites locally when that credential is unavailable.
 */

export const hasRuntimeModelCredentials = Boolean(process.env.VERCEL_OIDC_TOKEN);
