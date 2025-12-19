import type { NextConfig } from "next";
import path from "path";

// Set turbopack root to monorepo root where bun workspaces manage dependencies
const monorepoRoot = path.resolve(import.meta.dirname, "../..");
console.log("[next.config.ts] Setting turbopack root to:", monorepoRoot);

const nextConfig: NextConfig = {
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
      // Note: Fal.ai and other external provider URLs are proxied through our storage
    ],
  },
  // Increase body size limit for container image uploads (max 2GB)
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
  },

  // Turbopack config for monorepo workspace (dev mode only, builds use webpack)
  turbopack: {
    root: monorepoRoot,
  },

  // Skip TypeScript type checking during build (run separately with check-types)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Set output file tracing root to monorepo root (must match turbopack.root)
  outputFileTracingRoot: monorepoRoot,
  // CRITICAL: Include CloudFormation templates in the serverless function bundle
  // Without this, the template files won't be available when the function runs on Vercel
  outputFileTracingIncludes: {
    "/api/v1/containers": ["./scripts/cloudformation/**/*"],
    "/api/v1/containers/[id]": ["./scripts/cloudformation/**/*"],
    "/api/v1/cron/deployment-monitor": ["./scripts/cloudformation/**/*"],
  },
  outputFileTracingExcludes: {
    "*": [
      // Exclude pino ecosystem - has Node.js-only dependencies
      "node_modules/**/thread-stream/**/*",
      "node_modules/**/pino/**/*",
      "node_modules/**/sonic-boom/**/*",
      "node_modules/**/pino-pretty/**/*",
      // Exclude test directories from all packages
      "node_modules/**/test/**/*",
      "node_modules/**/tests/**/*",
      "node_modules/**/__tests__/**/*",
      // Bun-specific paths
      "node_modules/.bun/**/thread-stream/**/*",
      "node_modules/.bun/**/pino/**/*",
      "node_modules/.bun/**/sonic-boom/**/*",
    ],
  },

  // Handle pdfjs-dist and other problematic packages in serverless
  // These packages are externalized to prevent SSR issues with browser-only APIs
  serverExternalPackages: [
    "pdfjs-dist",
    "canvas",
    "pdf-parse",
    "@elizaos/plugin-mcp",
    "@modelcontextprotocol/sdk",
    "mcp-handler",
    "express",
    "worker_threads",
    // agent0-sdk has IPFS dependencies that use electron-fetch
    "agent0-sdk",
    "ipfs-http-client",
    "ipfs-utils",
    "electron-fetch",
    "electron",
    // pino and related packages cause SSR issues with Node.js-only dependencies
    "pino",
    "pino-pretty",
    "thread-stream",
    "sonic-boom",
    "real-require",
    "fast-redact",
    "on-exit-leak-free",
    "atomic-sleep",
    // Test dependencies that leak from pino/thread-stream
    "tape",
    // DOMPurify uses jsdom which has browser-specific dependencies
    "isomorphic-dompurify",
    "jsdom",
    // x402-mcp uses @modelcontextprotocol/sdk which is server-only
    "x402-mcp",
    // fs-related modules that shouldn't be in client bundles
    "fs",
    "fs/promises",
    "path",
    "os",
    "child_process",
    "crypto",
    "stream",
    "util",
    "events",
    "net",
    "tls",
    "http",
    "https",
    "zlib",
    "buffer",
    // oxapay uses __dirname + fs.readFile for method info JSON
    "oxapay",
  ],

  webpack: (config, { isServer }) => {
    // Fix for worker_threads not being handled by Turbopack
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("worker_threads");
      }
    }

    // Prevent pino and related packages from being bundled (they have Node.js-only deps)
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // Alias pino ecosystem to empty modules for client builds
    if (!isServer) {
      config.resolve.alias["pino"] = require.resolve("./lib/empty-module.js");
      config.resolve.alias["thread-stream"] =
        require.resolve("./lib/empty-module.js");
      config.resolve.alias["sonic-boom"] =
        require.resolve("./lib/empty-module.js");
      config.resolve.alias["pino-pretty"] =
        require.resolve("./lib/empty-module.js");
    }

    return config;
  },

  // Production Security Headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              // Default source - only allow same origin
              "default-src 'self'",
              // Scripts - allow self, Cloudflare Turnstile, Vercel Analytics, Monaco Editor CDN, and inline scripts for Next.js
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
              // Styles - allow self, inline styles, and Monaco Editor CDN (required for many UI libraries)
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Images - allow self, data URIs, blob URIs, Vercel storage, DiceBear avatars, Instagram CDN
              // Note: Fal.ai and other external provider URLs are proxied through our storage
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com",
              // Fonts - allow self, data URIs (for inline fonts like Monaco's Codicon), and Monaco Editor CDN
              "font-src 'self' data: https://cdn.jsdelivr.net",
              // Objects - block all (e.g., Flash, Java applets)
              "object-src 'none'",
              // Base URI - restrict to self
              "base-uri 'self'",
              // Form actions - restrict to self
              "form-action 'self'",
              // Frame ancestors - prevent embedding (clickjacking protection)
              "frame-ancestors 'none'",
              // Child/frame sources - Privy, WalletConnect iframes, and Vercel Sandbox
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org https://*.vercel.run",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org https://*.vercel.run",
              // Connect sources - API endpoints, WebSocket connections, and RPC providers
              [
                "connect-src 'self'",
                "https://auth.privy.io",
                "wss://relay.walletconnect.com",
                "wss://relay.walletconnect.org",
                "wss://www.walletlink.org",
                "https://*.rpc.privy.systems",
                "https://explorer-api.walletconnect.com",
                "https://api.relay.link",
                "https://api.testnets.relay.link",
                // Solana cluster endpoints
                "https://api.mainnet-beta.solana.com",
                "https://api.devnet.solana.com",
                "https://api.testnet.solana.com",
                // Additional services
                "https://api.openai.com",
                "https://api.stripe.com",
                "https://api.coingecko.com",
                "https://*.fal.ai",
                "https://api.elevenlabs.io",
                // Monaco Editor CDN (for source maps)
                "https://cdn.jsdelivr.net",
                // Vercel Analytics
                "https://vitals.vercel-insights.com",
                // Vercel Sandbox
                "https://*.vercel.run",
              ].join(" "),
              // Worker sources - allow self for web workers
              "worker-src 'self' blob:",
              // Manifest - allow self
              "manifest-src 'self'",
              // Media - allow self, data URIs, blob URIs, and video placeholder domain
              "media-src 'self' data: blob: https://video-placeholder.eliza.ai",
            ]
              .join("; ")
              .replace(/\s+/g, " "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
