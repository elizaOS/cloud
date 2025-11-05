import type { NextConfig } from "next";

const isMobileBuild = process.env.NEXT_PUBLIC_BUILD_MODE === "capacitor";

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
    // Disable image optimization for Capacitor static export
    unoptimized: isMobileBuild,
  },
  // Enable static export for Capacitor mobile app
  // Note: Mobile apps should call the deployed API backend (e.g., Vercel deployment)
  // API routes are not included in static export
  output: isMobileBuild ? "export" : undefined,
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
