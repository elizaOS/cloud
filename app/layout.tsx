import type { Metadata } from "next";
import { Geist_Mono, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "sonner";
import NextTopLoader from "nextjs-toploader";
import PrivyProvider from "@/providers/PrivyProvider";

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Get base URL with automatic Vercel URL detection as fallback
const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  title: {
    default: "elizaOS Platform - AI Agent Development Platform",
    template: "%s | elizaOS Platform",
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
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${robotoMono.variable} ${geistMono.variable} antialiased`}
      >
        <PrivyProvider>
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
                className: "font-mono",
              }}
            />
          </ThemeProvider>
        </PrivyProvider>
        <Analytics />
      </body>
    </html>
  );
}
