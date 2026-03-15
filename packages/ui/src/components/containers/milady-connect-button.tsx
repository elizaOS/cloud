"use client";

import { ExternalLink } from "lucide-react";
import { BrandButton } from "@elizaos/ui";
import { openWebUIWithPairing } from "@/lib/hooks/open-web-ui";

interface Props {
  agentId: string;
}

export function MiladyConnectButton({ agentId }: Props) {
  return (
    <BrandButton
      variant="primary"
      size="sm"
      onClick={() => openWebUIWithPairing(agentId)}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Open Web UI
    </BrandButton>
  );
}
