/** @type {import('next').NextConfig} */
const nextConfig = {
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
