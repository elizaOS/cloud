type EnvLike = Record<string, string | undefined>;

/**
 * Vercel preview builds run with NODE_ENV=production, so prefer VERCEL_ENV
 * when it is available to distinguish real production deployments.
 */
export function isProductionDeployment(env: EnvLike = process.env): boolean {
  if (env.VERCEL_ENV) {
    return env.VERCEL_ENV === "production";
  }

  return env.NODE_ENV === "production";
}

export function shouldBlockUnsafeWebhookSkip(
  env: EnvLike = process.env,
): boolean {
  return (
    env.SKIP_WEBHOOK_VERIFICATION === "true" && isProductionDeployment(env)
  );
}

export function shouldBlockDevnetBypass(env: EnvLike = process.env): boolean {
  return env.DEVNET === "true" && isProductionDeployment(env);
}
