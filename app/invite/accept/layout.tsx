import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept Invitation",
  description:
    "Accept your organization invitation to join an ELIZA CLOUD workspace and collaborate with your team.",
};

export default function InviteAcceptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
