"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAddModule: () => void;
}

export function CanvasContextMenu({ x, y, onClose, onAddModule }: CanvasContextMenuProps) {
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
      className="fixed z-50 bg-neutral-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onAddModule();
          onClose();
        }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-left text-white hover:bg-white/10 transition-colors"
      >
        <Plus className="w-4 h-4 text-[#FF5800]" />
        <span className="font-medium">Add a module</span>
      </button>
    </div>
  );
}
