import "@/app/globals.css";

import type { Metadata } from "next";

import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { inter } from "@/lib/fonts";

import { siteConfig } from "./config";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : siteConfig.url,
  ),
  description: siteConfig.description,
  keywords: [
    "AI character",
    "AI companion",
    "virtual character",
    "AI chat",
    "create character",
    "AI conversation",
    "virtual companion",
    "AI relationship",
    "chatbot",
  ],
  authors: [
    {
      name: "CreateACharacter",
      url: siteConfig.url,
    },
  ],
  creator: "CreateACharacter",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: "CreateACharacter",
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: "@createacharacter",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }} className="dark">
      <body className={`${inter.className} bg-background antialiased`}>
        <Providers>
          <Header />
          <main className="pt-14">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
