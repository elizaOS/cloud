/**
 * Create service button component that opens the service builder dialog.
 * Provides a button trigger for creating MCP/A2A service endpoints.
 */

"use client";

import { useState } from "react";
import { Server } from "lucide-react";
import { BrandButton } from "@/components/brand";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServiceBuilder } from "@/components/builders/service-builder";
import { toast } from "sonner";

export function CreateServiceButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <BrandButton variant="hud" onClick={() => setIsOpen(true)}>
        <Server className="h-4 w-4 mr-2" />
        Create Service
      </BrandButton>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">
              Create MCP/A2A Service
            </DialogTitle>
          </DialogHeader>
          <ServiceBuilder
            onSave={() => {
              setIsOpen(false);
              toast.success("Service created successfully");
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
