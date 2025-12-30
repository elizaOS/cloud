import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "sonner";
import NextTopLoader from "nextjs-toploader";
import PrivyProvider from "@/lib/providers/PrivyProvider";
import { CreditsProvider } from "@/lib/providers/CreditsProvider";
import localFont from "next/font/local";

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
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  title: {
    default: "Cloud - AI Agent Development Platform",
    template: "%s | Cloud",
  },
  description:
    "Complete AI agent development platform with inference, hosting, storage, and rapid deployment. Build, deploy, and scale intelligent agents with ease.",
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
  authors: [{ name: "elizaOS Team" }],
  creator: "elizaOS",
  publisher: "elizaOS",
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "elizaOS Platform - AI Agent Development Platform",
    description:
      "Complete AI agent development platform with inference, hosting, storage, and rapid deployment",
    url: "/",
    siteName: "elizaOS Platform",
    type: "website",
    locale: "en_US",
    // Images handled automatically via opengraph-image.png file convention
  },
  twitter: {
    card: "summary_large_image",
    title: "elizaOS Platform",
    description:
      "Complete AI agent development platform with inference, hosting, storage, and rapid deployment",
    // Images handled automatically via twitter-image.png file convention
    creator: "@elizaos",
    site: "@elizaos",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/cloudlogo-white.svg",
    shortcut: "/cloudlogo-white.svg",
    apple: "/cloudlogo-white.svg",
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
        className={`${sfPro.variable} antialiased selection:bg-[#FF5800] selection:text-white`}
      >
        <PrivyProvider>
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
        </PrivyProvider>
        <Analytics />
      </body>
    </html>
  );
}
