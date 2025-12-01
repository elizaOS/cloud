import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  // Increase body size limit for container image uploads (max 2GB)
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
  },

  // Skip TypeScript type checking during build (run separately with check-types)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable output file tracing to avoid worker_threads NFT error in Turbopack
  // This is a workaround for Turbopack bug with Node.js built-in modules
  outputFileTracingRoot: undefined,
  // CRITICAL: Include CloudFormation templates in the serverless function bundle
  // Without this, the template files won't be available when the function runs on Vercel
  outputFileTracingIncludes: {
    "/api/v1/containers": ["./infrastructure/cloudformation/**/*"],
    "/api/v1/containers/[id]": ["./infrastructure/cloudformation/**/*"],
    "/api/v1/cron/deployment-monitor": ["./infrastructure/cloudformation/**/*"],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/thread-stream/**/*",
      "node_modules/pino/**/*",
      "node_modules/sonic-boom/**/*",
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
  ],

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
              // Images - allow self, data URIs, blob URIs, and Vercel storage
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com",
              // Fonts - allow self and Monaco Editor CDN
              "font-src 'self' https://cdn.jsdelivr.net",
              // Objects - block all (e.g., Flash, Java applets)
              "object-src 'none'",
              // Base URI - restrict to self
              "base-uri 'self'",
              // Form actions - restrict to self
              "form-action 'self'",
              // Frame ancestors - prevent embedding (clickjacking protection)
              "frame-ancestors 'none'",
              // Child/frame sources - Privy and WalletConnect iframes
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org",
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
              ].join(" "),
              // Worker sources - allow self for web workers
              "worker-src 'self' blob:",
              // Manifest - allow self
              "manifest-src 'self'",
              // Media - allow self, data URIs, and blob URIs
              "media-src 'self' data: blob:",
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
