import type { Metadata } from "next";
import "./globals.css";

// Force dynamic rendering to avoid React version conflicts during prerendering
export const dynamic = 'force-dynamic';
import { Analytics } from "@/lib/services/dws/analytics";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "sonner";
import NextTopLoader from "nextjs-toploader";
import OAuth3Provider, { OAuth3AuthWrapper } from "@/lib/providers/OAuth3Provider";
import { CreditsProvider } from "@/lib/providers/CreditsProvider";

// Use system font stack instead of bundling SF Pro (saves 24MB)
// SF Pro is available natively on macOS/iOS, other systems get appropriate fallbacks
const sfProFontClass = {
  variable: "--font-sf-pro",
  className: "",
};

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
    images: [
      {
        url: `${baseUrl}/api/og?type=default&title=elizaOS Platform&description=AI Agent Development Platform`,
        width: 1200,
        height: 630,
        alt: "elizaOS Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "elizaOS Platform",
    description:
      "Complete AI agent development platform with inference, hosting, storage, and rapid deployment",
    images: [
      `${baseUrl}/api/og?type=default&title=elizaOS Platform&description=AI Agent Development Platform`,
    ],
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
        className={`${sfProFontClass.variable} antialiased selection:bg-[#FF5800] selection:text-white`}
      >
        <OAuth3Provider>
          <OAuth3AuthWrapper>
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
          </OAuth3AuthWrapper>
        </OAuth3Provider>
        <Analytics />
      </body>
    </html>
  );
}
