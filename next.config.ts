import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  // Only scan the content directory for MDX files
  contentDirBasePath: "/docs",
});

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
        hostname: "api.dicebear.com",
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
  },
  turbopack: {},
  typescript: {
    ignoreBuildErrors: true,
  },
  outputFileTracingRoot: undefined,
  outputFileTracingIncludes: {
    "/api/v1/containers": ["./scripts/cloudformation/**/*"],
    "/api/v1/containers/[id]": ["./scripts/cloudformation/**/*"],
    "/api/v1/cron/deployment-monitor": ["./scripts/cloudformation/**/*"],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/thread-stream/**/*",
      "node_modules/pino/**/*",
      "node_modules/sonic-boom/**/*",
    ],
  },
  serverExternalPackages: [
    "pdfjs-dist",
    "canvas",
    "pdf-parse",
    "@elizaos/plugin-mcp",
    "@modelcontextprotocol/sdk",
    "mcp-handler",
    "express",
    "worker_threads",
    "agent0-sdk",
    "ipfs-http-client",
    "ipfs-utils",
    "electron-fetch",
    "electron",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("worker_threads");
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Images - allow self, data URIs, blob URIs, Vercel storage, Instagram CDN, DiceBear avatars
              // Note: Fal.ai URLs are proxied through our storage, so not needed here
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com",
              // Fonts - allow self and Monaco Editor CDN
              "font-src 'self' https://cdn.jsdelivr.net",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org https://*.vercel.run",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org https://*.vercel.run",
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
                "https://api.mainnet-beta.solana.com",
                "https://api.devnet.solana.com",
                "https://api.testnet.solana.com",
                "https://api.openai.com",
                "https://api.stripe.com",
                "https://api.coingecko.com",
                "https://*.fal.ai",
                "https://api.elevenlabs.io",
                "https://cdn.jsdelivr.net",
                "https://vitals.vercel-insights.com",
                "https://*.vercel.run",
              ].join(" "),
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              // Media - allow self, data URIs, blob URIs, and video placeholder domain
              "media-src 'self' data: blob: https://video-placeholder.eliza.ai",
            ]
              .join("; ")
              .replace(/\s+/g, " "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Exclude auth-error from page generation to avoid naming conflict
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'mdx', 'md'],
};

export default withNextra(nextConfig);
