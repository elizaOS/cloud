 "use client";

import { memo } from "react";
import { Plus } from "lucide-react";

interface AddButtonNodeProps {
  data: {
    onClick: () => void;
  };
}

export const AddButtonNode = memo(function AddButtonNode({
  data,
}: AddButtonNodeProps) {
  return (
    <button
      onClick={data.onClick}
      className="flex items-center justify-center w-20 h-20 rounded-full bg-[#FF5800] hover:bg-[#FF5800]/90 shadow-lg shadow-[#FF5800]/30 transition-all hover:scale-110 cursor-pointer"
    >
      <Plus className="w-10 h-10 text-black" strokeWidth={2.5} />
    </button>
  );
});
