const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  "https://eliza.gg",
  "https://www.eliza.gg",
].filter(Boolean) as string[];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  // Only reflect origin if it's in the allowlist; otherwise use first allowed origin or reject
  // Only set origin header for allowed origins, otherwise omit it entirely
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : "null";  // Return null for non-allowed origins
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}
