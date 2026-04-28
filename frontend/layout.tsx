// TODO(migrate-metadata): convert export const metadata / generateMetadata to <Helmet>.
// TODO(migrate): file imports a Next.js server-only API (next/headers|next/cache|next/font). These do not exist in a SPA. Move logic to API endpoint or convert client-side.
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@elizaos/cloud-ui";
import { Analytics } from "@vercel/analytics/next";
import { DM_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";
import { CreditsProvider } from "@/lib/providers/CreditsProvider";
import { PostHogProvider } from "@/lib/providers/PostHogProvider";
import { StewardAuthProvider } from "@/lib/providers/StewardProvider";
import { getRobotsMetadata } from "@/lib/seo";

// DM Mono for landing page
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

// Inter for hero headings
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

// Performance optimization: Load only essential font weights (reduced from 7 to 4)
// This reduces initial font bundle size by ~40%
// preload: false prevents unused font preload warnings since SF Pro is only used in specific UI elements
const sfPro = localFont({
  src: [
    {
      path: "./fonts/sf-pro/SF-Pro-Display-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/sf-pro/SF-Pro-Display-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/sf-pro/SF-Pro-Display-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/sf-pro/SF-Pro-Display-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sf-pro",
  display: "swap",
  preload: false,
});

/**
 * Gets the base URL for the application with automatic Vercel URL detection as fallback.
 */
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const shouldEnableVercelAnalytics = process.env.VERCEL === "1";
const robots = getRobotsMetadata();

export const metadata: Metadata = {
  title: {
    default: "Eliza Cloud - Managed Hosting for AI Agents",
    template: "%s | Eliza Cloud",
  },
  description:
    "Managed hosting, provisioning, billing, and deployment for AI agents on Eliza Cloud.",
  keywords: [
    "AI",
    "agents",
    "elizaOS",
    "platform",
    "development",
    "hosting",
    "machine learning",
    "artificial intelligence",
    "LLM",
    "deployment",
  ],
  authors: [{ name: "Eliza Cloud" }],
  creator: "Eliza Cloud",
  publisher: "Eliza Cloud",
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Eliza Cloud - Managed Hosting for AI Agents",
    description: "Managed hosting, provisioning, billing, and deployment for AI agents",
    url: "/",
    siteName: "Eliza Cloud",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/cloudlogo.png",
        width: 1200,
        height: 630,
        alt: "Eliza Cloud",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eliza Cloud",
    description: "Managed hosting, provisioning, billing, and deployment for AI agents",
    images: ["/cloudlogo.png"],
  },
  robots,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

/**
 * Root layout component that wraps all pages with providers and global styles.
 *
 * @param children - The page content to render.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sfPro.variable} ${dmMono.variable} ${inter.variable} antialiased selection:bg-[#FF5800] selection:text-white`}
      >
        <StewardAuthProvider>
          <PostHogProvider>
            <CreditsProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <NextTopLoader showSpinner={false} color="#FF5800" />
                {children}
                <Toaster
                  richColors
                  theme="dark"
                  position="top-right"
                  toastOptions={{
                    style: {
                      background: "rgba(0, 0, 0, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "white",
                      backdropFilter: "blur(12px)",
                      borderRadius: "0px",
                    },
                    className: "font-sf-pro",
                  }}
                />
              </ThemeProvider>
            </CreditsProvider>
          </PostHogProvider>
        </StewardAuthProvider>
        {shouldEnableVercelAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
