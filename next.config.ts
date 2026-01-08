import type { NextConfig } from "next";
import nextra from "nextra";
import path from "path";

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
    if (isServer) {
      // Resolve thread-stream to synchronous stub in production webpack builds
      // This prevents pino from creating dynamic worker modules like pino-28069d5257187539
      const stubPath = path.join(__dirname, "lib/stubs/thread-stream.ts");
      const loggerStubPath = path.join(
        __dirname,
        "lib/stubs/walletconnect-logger.ts",
      );
      config.resolve.alias = {
        ...config.resolve.alias,
        "thread-stream": stubPath,
        // Stub walletconnect logger to prevent nested pino 7.x from loading
        "@walletconnect/logger": loggerStubPath,
      };
    }
    return config;
  },
  transpilePackages: ["next-mdx-remote"],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: eslint config is no longer supported in next.config.ts for Next.js 16+
  // Use eslint.config.mjs instead
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
    "@elizaos/plugin-mcp",
    "@modelcontextprotocol/sdk",
    "mcp-handler",
    "express",
    "worker_threads",
    "ipfs-http-client",
    "ipfs-utils",
    "electron-fetch",
    "electron",
    // oxapay uses __dirname + fs.readFile for method info JSON
    "oxapay",
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
            value:
              "Content-Type, Authorization, X-API-Key, X-Request-ID, Cookie",
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
              // Images - allow self, data URIs, blob URIs, Vercel storage, Instagram CDN, DiceBear avatars, Unsplash
              // Note: Fal.ai URLs are proxied through our storage, so not needed here
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://raw.githubusercontent.com https://*.fbcdn.net https://*.cdninstagram.com https://api.dicebear.com https://images.unsplash.com https://pbs.twimg.com https://abs.twimg.com",
              // Fonts - allow self, Monaco Editor CDN, and Vercel sandboxes (for iframe embedding)
              "font-src 'self' https://cdn.jsdelivr.net https://*.vercel.run https://*.vercel.app",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              // Allow iframes from any origin - sandbox apps need to embed
              "frame-ancestors *",
              "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://oauth.telegram.org https://*.vercel.run https://www.youtube.com https://youtube.com",
              "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://oauth.telegram.org https://*.vercel.run https://www.youtube.com https://youtube.com",
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
};

export default withNextra(nextConfig);
