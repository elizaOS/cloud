import type { NextConfig } from "next";
import nextra from "nextra";
import path from "path";
import { shouldBlockUnsafeWebhookSkip } from "./lib/config/deployment-environment";

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
      "thread-stream": "./lib/stubs/thread-stream.ts",
      "@walletconnect/logger": "./lib/stubs/walletconnect-logger.ts",
    },
  },
  webpack: (config, { isServer }) => {
    // react-syntax-highlighter (via @elizaos/ui) dynamically imports highlight.js
    // languages, refractor grammars, and lowlight modules. Many are removed/renamed
    // in newer versions or not installed (bun hoisting issue). Suppress these —
    // they're client-side syntax highlighting features that don't affect server routes.
    const webpack = require("webpack");
    config.plugins.push(
      new webpack.IgnorePlugin({
        // Ignore missing highlight.js language files (c-like, htmlbars, sql_more removed in v11)
        resourceRegExp: /^highlight\.js\/lib\/languages\/(c-like|htmlbars|sql_more)$/,
      }),
      new webpack.IgnorePlugin({
        // Ignore refractor grammar imports — refractor isn't installed
        resourceRegExp: /^refractor\b/,
        contextRegExp: /react-syntax-highlighter/,
      }),
      new webpack.IgnorePlugin({
        // Ignore lowlight imports — lowlight isn't installed
        resourceRegExp: /^lowlight\b/,
        contextRegExp: /react-syntax-highlighter/,
      }),
    );
    if (isServer) {
      // Resolve thread-stream to synchronous stub in production webpack builds
      // This prevents pino from creating dynamic worker modules like pino-28069d5257187539
      const stubPath = path.join(__dirname, "lib/stubs/thread-stream.ts");
      const loggerStubPath = path.join(__dirname, "lib/stubs/walletconnect-logger.ts");
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
  transpilePackages: ["next-mdx-remote", "@elizaos/ui"],
  // Note: linting is handled by Biome (biome.json), not next.config.ts
  outputFileTracingRoot: undefined,
  outputFileTracingIncludes: {
    "/api/v1/containers": ["./scripts/cloudformation/**/*"],
    "/api/v1/containers/[id]": ["./scripts/cloudformation/**/*"],
    "/api/v1/cron/deployment-monitor": ["./scripts/cloudformation/**/*"],
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
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID, Cookie",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // CSP headers for non-API routes
      {
        source: "/:path((?!api).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Images - allow self, data URIs, blob URIs, Vercel storage, Instagram CDN, DiceBear avatars, Unsplash, Discord CDN
              // Note: Fal.ai URLs are proxied through our storage, so not needed here
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com https://images.unsplash.com https://pbs.twimg.com https://abs.twimg.com https://cdn.discordapp.com",
              // Fonts - allow self, Monaco Editor CDN, and Vercel sandboxes (for iframe embedding)
              "font-src 'self' https://cdn.jsdelivr.net https://*.vercel.run https://*.vercel.app",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              // Allow iframes from any origin - sandbox apps need to embed
              "frame-ancestors *",
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org https://*.vercel.run https://www.youtube.com https://youtube.com https://www.elizacloud.ai https://elizacloud.ai",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org https://*.vercel.run https://www.youtube.com https://youtube.com https://www.elizacloud.ai https://elizacloud.ai",
              ["connect-src *"].join(" "),
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              // Media - allow self, data URIs, blob URIs, Vercel blob storage (for videos), and video placeholder domain
              "media-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://video-placeholder.eliza.ai",
            ]
              .join("; ")
              .replace(/\s+/g, " "),
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
