import type { NextConfig } from "next";
import nextra from "nextra";
import path from "path";
import { shouldBlockUnsafeWebhookSkip } from "./packages/lib/config/deployment-environment";
import {
  CORS_ALLOW_HEADERS,
  CORS_ALLOW_METHODS,
  CORS_MAX_AGE,
} from "./packages/lib/cors-constants";

// =============================================================================
// CRITICAL SECURITY VALIDATION
// =============================================================================
// Fail fast if SKIP_WEBHOOK_VERIFICATION is enabled in production.
// This environment variable bypasses webhook signature verification and must
// NEVER be enabled in production environments.
// =============================================================================
if (shouldBlockUnsafeWebhookSkip(process.env)) {
  throw new Error(
    "FATAL: SKIP_WEBHOOK_VERIFICATION cannot be enabled in production. " +
      "This is a critical security misconfiguration that would allow " +
      "unauthenticated webhook requests. Remove this environment variable " +
      "from your production deployment.",
  );
}

const withNextra = nextra({
  // Only scan the content directory for MDX files
  contentDirBasePath: "/docs",
});

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.startsWith("http") ? value : `https://${value}`;
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function uniqueCspValues(values: Array<string | null | undefined>): string {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .join(" ");
}

const appOrigin = normalizeOrigin(
  process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
);
const posthogOrigin =
  normalizeOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST) || "https://us.i.posthog.com";
// Allow loopback origins in CSP not just for `next dev`, but also when running
// `next start` against a local Steward instance (NEXT_PUBLIC_STEWARD_AUTH_ENABLED=true).
// Otherwise the browser refuses fetch() to localhost:3200 with a CSP error and
// the StewardLogin form can't fetch /auth/providers, /tenants/config, etc.
const isLocalDev =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_STEWARD_AUTH_ENABLED === "true";
const localDevConnectOrigins = isLocalDev
  ? [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "ws://localhost:3000",
      "ws://127.0.0.1:3000",
      // Local Steward API (started via `bun run start:local` in steward-fi)
      "http://localhost:3200",
      "http://127.0.0.1:3200",
    ]
  : [];

const frameSrc = uniqueCspValues([
  "'self'",
  appOrigin,
  "https://auth.privy.io",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://challenges.cloudflare.com",
  "https://oauth.telegram.org",
  "https://*.vercel.run",
  "https://*.vercel.app",
  "https://www.youtube.com",
  "https://youtube.com",
]);

const connectSrc = uniqueCspValues([
  "'self'",
  appOrigin,
  posthogOrigin,
  "https://auth.privy.io",
  "https://api.privy.io",
  "https://*.privy.io",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://relay.walletconnect.com",
  "https://*.walletconnect.com",
  "wss://relay.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://pulse.walletconnect.org",
  "https://challenges.cloudflare.com",
  "https://va.vercel-scripts.com",
  "https://vercel.live",
  "https://*.vercel.run",
  "https://*.vercel.app",
  "https://us-assets.i.posthog.com",
  // Steward auth
  "https://eliza.steward.fi",
  "https://steward-api-production-115d.up.railway.app",
  "https://*.steward.fi",
  ...localDevConnectOrigins,
]);

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://vercel.live https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com https://images.unsplash.com https://pbs.twimg.com https://abs.twimg.com https://cdn.discordapp.com",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://auth.privy.io https://oauth.telegram.org",
  "frame-ancestors 'self'",
  `child-src ${frameSrc}`,
  `frame-src ${frameSrc}`,
  `connect-src ${connectSrc}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://video-placeholder.eliza.ai",
]
  .join("; ")
  .replace(/\s+/g, " ");

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.qrserver.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "abs.twimg.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
        port: "",
        pathname: "/**",
      },
      // Note: Fal.ai URLs are no longer allowed - all assets are proxied through our storage
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
    // Speed up builds by optimizing large package imports
    optimizePackageImports: [
      "@tabler/icons-react",
      "lucide-react",
      "@radix-ui/react-icons",
      "recharts",
      "date-fns",
    ],
  },
  turbopack: {
    root: __dirname,
    // Resolve thread-stream to a synchronous stub to avoid dynamic module names
    // that pino/thread-stream creates at runtime (like pino-28069d5257187539)
    // which cannot be resolved in serverless environments
    // Note: turbopack requires relative paths from project root
    resolveAlias: {
      "thread-stream": "./packages/lib/stubs/thread-stream.ts",
      "@walletconnect/logger": "./packages/lib/stubs/walletconnect-logger.ts",
    },
  },
  webpack: (config, { isServer }) => {
    // react-syntax-highlighter (via @elizaos/cloud-ui) dynamically imports highlight.js
    // languages, refractor grammars, and lowlight modules. Many are removed/renamed
    // in newer versions or not installed (bun hoisting issue). Suppress these —
    // they're client-side syntax highlighting features that don't affect server routes.
    const webpack = require("webpack");
    config.plugins.push(
      new webpack.IgnorePlugin({
        // Ignore missing highlight.js language files (c-like, htmlbars, sql_more removed in v11)
        resourceRegExp: /^highlight\.js\/lib\/languages\/(c-like|htmlbars|sql_more)$/,
      }),
    );
    if (isServer) {
      // Resolve thread-stream to synchronous stub in production webpack builds
      // This prevents pino from creating dynamic worker modules like pino-28069d5257187539
      const stubPath = path.join(__dirname, "packages/lib/stubs/thread-stream.ts");
      const loggerStubPath = path.join(__dirname, "packages/lib/stubs/walletconnect-logger.ts");
      config.resolve.alias = {
        ...config.resolve.alias,
        "thread-stream": stubPath,
        // Stub walletconnect logger to prevent nested pino 7.x from loading
        "@walletconnect/logger": loggerStubPath,
      };
    }
    // When DEV_LINKED=1, disable symlink resolution so webpack follows
    // symlinked dist/ directories from dev-link.sh
    if (process.env.DEV_LINKED === "1") {
      config.resolve.symlinks = false;
    }
    return config;
  },
  transpilePackages: ["next-mdx-remote", "@elizaos/cloud-ui"],
  // Note: linting is handled by Biome (biome.json), not next.config.ts
  outputFileTracingRoot: undefined,
  outputFileTracingIncludes: {
    "/api/v1/containers": ["./packages/scripts/cloudformation/**/*"],
    "/api/v1/containers/[id]": ["./packages/scripts/cloudformation/**/*"],
    "/api/v1/cron/deployment-monitor": ["./packages/scripts/cloudformation/**/*"],
  },
  serverExternalPackages: [
    "pdfjs-dist",
    "canvas",
    "pdf-parse",
    "@modelcontextprotocol/sdk",
    "mcp-handler",
    "express",
    "worker_threads",
    "ipfs-http-client",
    "ipfs-utils",
    "electron-fetch",
    "electron",
    "@privy-io/server-auth",
    "@solana/web3.js",
    "@upstash/redis",
    // oxapay uses __dirname + fs.readFile for method info JSON
    "oxapay",
    // Prevent Response polyfill conflicts (Next.js #58611)
    // These packages polyfill global Response which breaks instanceof checks
    "undici",
    "cross-fetch",
    // jsdom ESM dependencies break when bundled - keep external for Node.js loading
    "jsdom",
    "isomorphic-dompurify",
    // ssh2 ships non-ECMAScript assets that Turbopack cannot place into ESM chunks
    "ssh2",
    // @vercel/sandbox has native deps (jsonlines) that break local webpack builds
    "@vercel/sandbox",
    // Redis sub-packages have optional native deps that break local webpack
    "redis",
    "@redis/client",
    "@redis/graph",
    "@redis/json",
    "@redis/search",
    "@redis/time-series",
    "@redis/bloom",
    // elizaOS core performs runtime-only dynamic imports for hook handlers.
    // Keep it external so Turbopack does not try to resolve cache-busted file
    // URLs like import(`${handlerUrl}?t=...`) at build time.
    "@elizaos/core",
    // NOTE: pino and thread-stream are NOT external - they get bundled with
    // the thread-stream alias to our synchronous stub, preventing dynamic
    // worker module loading (pino-28069d5257187539) that fails in serverless
  ],

  async headers() {
    return [
      // CORS headers for all API routes - allow any origin with valid auth
      // Note: Credentials cannot be used with wildcard origin - auth is via tokens in headers
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: CORS_ALLOW_METHODS,
          },
          {
            key: "Access-Control-Allow-Headers",
            value: CORS_ALLOW_HEADERS,
          },
          { key: "Access-Control-Max-Age", value: CORS_MAX_AGE },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // CSP headers for non-API routes
      {
        source: "/:path((?!api).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          // Remove X-Frame-Options to allow iframes - frame-ancestors CSP handles this now
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
      // Auth flows that open OAuth provider popups need to inspect
      // window.closed to detect when the user finishes (or cancels) the
      // popup. Browsers default Cross-Origin-Opener-Policy to "same-origin"
      // for COEP-isolated contexts, which throws on the closed check and
      // hangs the parent. "same-origin-allow-popups" preserves cross-origin
      // isolation while allowing the popup-callback contract.
      {
        source: "/app-auth/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  // Exclude auth-error from page generation to avoid naming conflict
  pageExtensions: ["tsx", "ts", "jsx", "js", "mdx", "md"],

  async rewrites() {
    return [
      // Serve static HTML for privacy policy (required for Google OAuth verification)
      // Google's crawler needs plain HTML, not React-rendered pages
      {
        source: "/privacy-policy",
        destination: "/privacy-policy.html",
      },
    ];
  },
};

export default withNextra(nextConfig);
