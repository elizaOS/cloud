"use client";

import { Settings, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function NodeContextMenu({
  x,
  y,
  nodeId,
  onClose,
  onSettings,
  onDelete,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-neutral-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onSettings();
          onClose();
        }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-white hover:bg-white/10 transition-colors"
      >
        <Settings className="w-4 h-4 text-white/60" />
        <span>Settings</span>
      </button>
      <div className="border-t border-white/10 my-1" />
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        <span>Delete</span>
      </button>
    </div>
  );
}
