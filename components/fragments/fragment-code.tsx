"use client";

import { CodeView } from "./code-view";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, FileText } from "lucide-react";
import { useState } from "react";

export function FragmentCode({
  files,
}: {
  files: { name: string; content: string }[];
}) {
  const [currentFile, setCurrentFile] = useState(files[0]?.name || "");
  const currentFileContent =
    files.find((file) => file.name === currentFile)?.content || "";

  function download(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No code to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-2 sm:px-3 pt-1 sm:pt-2 gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex flex-1 gap-1.5 sm:gap-2 overflow-x-auto min-w-0">
          {files.map((file) => (
            <div
              key={file.name}
              className={`flex gap-1 sm:gap-2 select-none cursor-pointer items-center text-xs sm:text-sm text-muted-foreground px-1.5 sm:px-2 py-1 rounded-md hover:bg-muted border shrink-0 ${
                file.name === currentFile ? "bg-muted border-muted" : ""
              }`}
              onClick={() => setCurrentFile(file.name)}
            >
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-none">
                {file.name}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <CopyButton
                  content={currentFileContent}
                  className="text-muted-foreground"
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground h-7 w-7 sm:h-9 sm:w-9"
                  onClick={() => download(currentFile, currentFileContent)}
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-x-auto">
        <CodeView
          code={currentFileContent}
          lang={currentFile.split(".").pop() || ""}
        />
      </div>
    </div>
  );
}
