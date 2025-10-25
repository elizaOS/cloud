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
  // Handle pdfjs-dist and other problematic packages in serverless
  serverExternalPackages: ["pdfjs-dist", "canvas", "pdf-parse"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Alias canvas to false to prevent it from being bundled
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;
