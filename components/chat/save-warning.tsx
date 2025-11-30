"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function SavedWarning({ onConfirm, onCancel }: any) {
  return (
    <Dialog open={true}>
      <DialogContent className="bg-[#0A0A0A] text-white border border-[#353535]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Unsaved Changes
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-white/70">
          You have unsaved changes on your Agent. Are you sure you want to leave
          this page?
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-white/70 hover:text-white"
          >
            Stay
          </Button>

          <Button onClick={onConfirm} className="bg-red-500 hover:bg-[#d000e6]">
            Leave without saving
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
