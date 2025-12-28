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
      // Note: Fal.ai URLs are no longer allowed - all assets are proxied through our storage
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
    // Enable instrumentation for runtime pre-warming
    instrumentationHook: true,
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              // Images - allow self, data URIs, blob URIs, Vercel storage, Instagram CDN, DiceBear avatars, Unsplash
              // Note: Fal.ai URLs are proxied through our storage, so not needed here
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com https://images.unsplash.com",
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
