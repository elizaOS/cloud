import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { Toaster } from "sonner";
import NextTopLoader from 'nextjs-toploader';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
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
  },
  twitter: {
    card: "summary_large_image",
    title: "elizaOS Platform",
    description:
      "Complete AI agent development platform with inference, hosting, storage, and rapid deployment",
    creator: "@elizaos",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <AuthKitProvider>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NextTopLoader showSpinner={false} color="white" />
            {children}
            <Toaster richColors />
          </ThemeProvider>
        </body>
      </AuthKitProvider>
      <Analytics />
    </html>
  );
}
