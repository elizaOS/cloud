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
      // Note: DiceBear removed - using local avatars from /public/avatars/
      // Note: All AI-generated images are stored via Eliza Cloud on Vercel Blob
    ],
  },
};

export default nextConfig;
