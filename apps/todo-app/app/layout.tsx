import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Eliza Todo - AI-Powered Task Management",
  description:
    "The intelligent todo app that helps you achieve more. Track daily habits, manage priorities, and level up with gamification.",
  keywords: ["todo", "tasks", "productivity", "ai", "gamification", "habits"],
  openGraph: {
    title: "Eliza Todo - AI-Powered Task Management",
    description: "The intelligent todo app that helps you achieve more.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
            },
          }}
        />
      </body>
    </html>
  );
}
