import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({
  // Only scan the content directory for MDX files
  contentDirBasePath: "/docs",
});

const nextConfig: NextConfig = {
  // Enable standalone output for DWS deployment
  output: "standalone",
  
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
  },
  // Turbopack configuration for monorepo - disabled for local dev compatibility
  // turbopack: {
  //   root: '/home/shaw/Documents/jeju',
  // },
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
  ],

  webpack: (config, { isServer, dev }) => {
    // Fix for worker_threads not being handled by Turbopack
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("worker_threads");
      }
    }

    // Production optimizations
    if (!dev && !isServer) {
      // Optimize chunk splitting for better caching
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
        runtimeChunk: "single",
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            // Vendor chunks - stable dependencies
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: "vendors",
              priority: 10,
              reuseExistingChunk: true,
            },
            // ElizaOS packages - frequently updated
            elizaos: {
              test: /[\\/]node_modules[\\/]@elizaos[\\/]/,
              name: "elizaos",
              priority: 20,
              reuseExistingChunk: true,
            },
            // UI libraries - large but stable
            ui: {
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|@tabler)[\\/]/,
              name: "ui-lib",
              priority: 15,
              reuseExistingChunk: true,
            },
            // Heavy libraries loaded separately
            monaco: {
              test: /[\\/]node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/,
              name: "monaco",
              priority: 25,
              reuseExistingChunk: true,
            },
            three: {
              test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
              name: "three",
              priority: 25,
              reuseExistingChunk: true,
            },
            recharts: {
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              name: "recharts",
              priority: 25,
              reuseExistingChunk: true,
            },
            // Common shared code
            common: {
              minChunks: 2,
              priority: 5,
              reuseExistingChunk: true,
              enforce: true,
            },
          },
          maxInitialRequests: 25,
          minSize: 20000,
        },
      };

      // Enable bundle analyzer if env variable is set
      if (process.env.ANALYZE === "true") {
        const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: "static",
            reportFilename: "./analyze/client.html",
            openAnalyzer: false,
          }),
        );
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
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'mdx', 'md'],
};

export default withNextra(nextConfig);
