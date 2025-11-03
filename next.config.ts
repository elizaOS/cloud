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
  // These packages are externalized to prevent SSR issues with browser-only APIs
  serverExternalPackages: ["pdfjs-dist", "canvas", "pdf-parse"],
};

export default nextConfig;
