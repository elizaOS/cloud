import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  // Only scan the content directory for MDX files
  contentDirBasePath: "/docs",
});

const nextConfig: NextConfig = {
  // Enable standalone output for DWS deployment
  output: "standalone",
  
  // Force transpilation of packages that might bundle their own React
  transpilePackages: [
    "@ai-sdk/react",
    "@ai-sdk/gateway",
    "@ai-sdk/openai",
    "ai",
  ],
  
  images: {
    remotePatterns: [
      // DWS Storage endpoints
      {
        protocol: "https",
        hostname: "storage.dws.local",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.testnet.jejunetwork.org",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.jejunetwork.org",
        port: "",
        pathname: "/**",
      },
      // IPFS gateways
      {
        protocol: "https",
        hostname: "ipfs.io",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "w3s.link",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "dweb.link",
        port: "",
        pathname: "/**",
      },
      // Legacy Vercel storage (backwards compatibility)
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
  typescript: {
    ignoreBuildErrors: true,
  },
  // Turbopack configuration for monorepo workspace root
  turbopack: {
    root: '/Users/shawwalters/jeju',
  },
  outputFileTracingRoot: undefined,
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
      // Exclude Solana native modules
      "node_modules/.bun/**/@solana/**/*",
      "node_modules/**/bigint-buffer/**/*",
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
    // Solana packages with native dependencies
    "bigint-buffer",
    "@solana/buffer-layout-utils",
    "@solana/spl-token",
    "@solana/web3.js",
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
    "whatwg-url",
    "saxes",
    "cssstyle",
    "data-urls",
    "w3c-xmlserializer",
    "domexception",
    "html-encoding-sniffer",
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
    // pino uses thread-stream for worker threads which creates dynamic module names
    // that can't be resolved in serverless environments
    "pino",
    "pino-std-serializers",
    "thread-stream",
    "sonic-boom",
    "on-exit-leak-free",
    "process-warning",
    // @elizaos/core uses pino internally
    "@elizaos/core",
  ],

  webpack: (config, { isServer, dev }) => {
    // Fix React version mismatch - ensure all packages use the same React version
    const path = require('path');
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
      'react/jsx-runtime': path.resolve('./node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve('./node_modules/react/jsx-dev-runtime'),
    };

    // Fix for worker_threads not being handled by Turbopack
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("worker_threads");
      }
    }

    // Enable bundle analyzer if env variable is set (dev only)
    if (process.env.ANALYZE === "true" && !dev && !isServer) {
      const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: "static",
          reportFilename: "./analyze/client.html",
          openAnalyzer: false,
        }),
      );
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Images - allow self, data URIs, blob URIs, DWS storage, IPFS gateways, Instagram CDN, DiceBear avatars, Unsplash
              "img-src 'self' data: blob: https://storage.dws.local https://storage.testnet.jejunetwork.org https://storage.jejunetwork.org https://ipfs.io https://w3s.link https://dweb.link https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com https://images.unsplash.com",
              // Fonts - allow self, data URIs (for inline fonts like Monaco's Codicon), and Monaco Editor CDN
              "font-src 'self' data: https://cdn.jsdelivr.net",
              // Objects - block all (e.g., Flash, Java applets)
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org",
              [
                "connect-src 'self'",
                // OAuth3 endpoints (local dev and production)
                "http://localhost:4200",
                "http://127.0.0.1:4200",
                "https://oauth3.dws.local",
                "https://oauth3.jejunetwork.org",
                // DWS endpoints
                "https://storage.dws.local",
                "https://storage.testnet.jejunetwork.org",
                "https://storage.jejunetwork.org",
                "https://*.dws.local",
                "https://*.jejunetwork.org",
                "wss://*.dws.local",
                "wss://*.jejunetwork.org",
                // Auth providers (legacy - keep for WalletConnect)
                "https://auth.privy.io",
                "wss://relay.walletconnect.com",
                "wss://relay.walletconnect.org",
                "wss://www.walletlink.org",
                "https://*.rpc.privy.systems",
                "https://explorer-api.walletconnect.com",
                "https://api.relay.link",
                "https://api.testnets.relay.link",
                // Blockchain RPC
                "https://api.mainnet-beta.solana.com",
                "https://api.devnet.solana.com",
                "https://api.testnet.solana.com",
                // External APIs
                "https://api.openai.com",
                "https://api.stripe.com",
                "https://api.coingecko.com",
                "https://*.fal.ai",
                "https://api.elevenlabs.io",
                "https://cdn.jsdelivr.net",
                // IPFS gateways
                "https://ipfs.io",
                "https://w3s.link",
                "https://dweb.link",
              ].join(" "),
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              // Media - allow self, data URIs, blob URIs, and video placeholder domain
              "media-src 'self' data: blob: https://video-placeholder.eliza.ai https://storage.dws.local https://storage.jejunetwork.org",
            ]
              .join("; ")
              .replace(/\s+/g, " "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DWS-Powered", value: "true" },
        ],
      },
    ];
  },
  // Exclude auth-error from page generation to avoid naming conflict
  pageExtensions: ["tsx", "ts", "jsx", "js", "mdx", "md"],
};

export default withNextra(nextConfig);
