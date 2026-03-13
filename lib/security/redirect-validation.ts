import { isAllowedOrigin } from "@/lib/security/origin-validation";

const DEFAULT_PLATFORM_REDIRECT_ORIGINS = [
  "http://localhost:3333",
  "http://localhost:3001",
  "http://127.0.0.1:3333",
  "http://127.0.0.1:3001",
];

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function hasEmbeddedCredentials(url: URL): boolean {
  return url.username.length > 0 || url.password.length > 0;
}

export function getDefaultPlatformRedirectOrigins(): string[] {
  return [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    ...DEFAULT_PLATFORM_REDIRECT_ORIGINS,
  ].filter((value): value is string => !!value);
}

export function isSafeRelativeRedirectPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

export function sanitizeRelativeRedirectPath(
  value: string | null | undefined,
  fallbackPath: string,
): string {
  if (!value) {
    return fallbackPath;
  }

  return isSafeRelativeRedirectPath(value) ? value : fallbackPath;
}

export function isAllowedAbsoluteRedirectUrl(
  value: string,
  allowedOrigins: string[],
): boolean {
  try {
    const parsed = new URL(value);
    if (!isHttpUrl(parsed) || hasEmbeddedCredentials(parsed)) {
      return false;
    }

    return isAllowedOrigin(allowedOrigins, parsed.toString());
  } catch {
    return false;
  }
}

export function assertAllowedAbsoluteRedirectUrl(
  value: string,
  allowedOrigins: string[],
  label = "redirect URL",
): URL {
  if (!isAllowedAbsoluteRedirectUrl(value, allowedOrigins)) {
    throw new Error(`Invalid ${label}`);
  }

  return new URL(value);
}

export function resolveSafeRedirectTarget(
  value: string | null | undefined,
  baseUrl: string,
  fallbackPath: string,
): URL {
  const safeFallback = new URL(fallbackPath, baseUrl);

  if (!value) {
    return safeFallback;
  }

  if (isSafeRelativeRedirectPath(value)) {
    return new URL(value, baseUrl);
  }

  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);

    if (
      isHttpUrl(parsed) &&
      !hasEmbeddedCredentials(parsed) &&
      parsed.origin === base.origin
    ) {
      return parsed;
    }
  } catch {
    // Fall back to the default route below.
  }

  return safeFallback;
}
