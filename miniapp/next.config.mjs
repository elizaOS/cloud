/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for catching issues
  reactStrictMode: true,
  
  // Webpack configuration for development tools
  webpack: (config, { dev, isServer }) => {
    // Only in development and on client-side
    if (dev && !isServer) {
      // Enable source maps for better debugging
      config.devtool = "cheap-module-source-map";
    }
    
    return config;
  },
  
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
        hostname: "fal.media",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.fal.ai",
        port: "",
        pathname: "/**",
      },
    ],
    // Allow unoptimized images as fallback for any URL
    unoptimized: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
