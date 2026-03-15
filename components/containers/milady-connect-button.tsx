"use client";

import { ExternalLink } from "lucide-react";
import { BrandButton } from "@elizaos/ui";

interface Props {
  agentId: string;
}

export function MiladyConnectButton({ agentId }: Props) {
  async function handleClick() {
    const popup = window.open("", "_blank");
    if (!popup) {
      alert("Popup blocked. Please allow popups and try again.");
      return;
    }

    try {
      popup.document.title = "Connecting…";
      popup.document.body.innerHTML =
        '<div style="font-family:sans-serif;padding:20px;background:#0a0a0a;color:#e5e5e5;min-height:100vh;display:flex;align-items:center;justify-content:center">Connecting to your agent…</div>';
    } catch {
      // cross-origin write may fail
    }

    try {
      const res = await fetch(
        `/api/v1/milaidy/agents/${agentId}/pairing-token`,
        { method: "POST" },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        popup.close();
        alert(
          data.error ||
            `Failed to generate pairing token (HTTP ${res.status})`,
        );
        return;
      }

      const { data } = await res.json();
      if (data?.redirectUrl) {
        popup.location.href = data.redirectUrl;
      } else {
        popup.close();
        alert("No redirect URL returned");
      }
    } catch (err) {
      popup.close();
      alert(
        `Failed to connect: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <BrandButton variant="primary" size="sm" onClick={handleClick}>
      <ExternalLink className="h-3.5 w-3.5" />
      Open Web UI
    </BrandButton>
  );
}
