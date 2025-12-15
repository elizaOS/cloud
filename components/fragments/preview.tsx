"use client";

import { FragmentCode } from "./fragment-code";
import { FragmentPreview } from "./fragment-preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FragmentSchema } from "@/lib/fragments/schema";
import { getTemplateId } from "@/lib/fragments/templates";
import type { ExecutionResult } from "@/lib/fragments/types";
import { DeepPartial } from "ai";
import { ChevronsRight, LoaderCircle } from "lucide-react";
import { Dispatch, SetStateAction } from "react";

export function Preview({
  selectedTab,
  onSelectedTabChange,
  isChatLoading,
  isPreviewLoading,
  fragment,
  result,
  onClose,
}: {
  selectedTab: "code" | "fragment";
  onSelectedTabChange: Dispatch<SetStateAction<"code" | "fragment">>;
  isChatLoading: boolean;
  isPreviewLoading: boolean;
  fragment?: DeepPartial<FragmentSchema>;
  result?: ExecutionResult;
  onClose: () => void;
}) {
  if (!fragment) {
    return null;
  }

  const isLinkAvailable =
    result?.template &&
    getTemplateId(result?.template!) !== "code-interpreter-v1";

  return (
    <div className="fixed lg:relative inset-0 lg:inset-auto z-50 lg:z-10 top-0 left-0 shadow-2xl lg:rounded-tl-3xl lg:rounded-bl-3xl lg:border-l lg:border-y bg-popover h-full w-full overflow-hidden flex flex-col">
      <Tabs
        value={selectedTab}
        onValueChange={(value) =>
          onSelectedTabChange(value as "code" | "fragment")
        }
        className="h-full flex flex-col items-start justify-start flex-1 min-h-0"
      >
        <div className="w-full p-2 sm:p-3 grid grid-cols-3 items-center border-b gap-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground shrink-0"
                  onClick={onClose}
                  aria-label="Close preview"
                >
                  <ChevronsRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close preview</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex justify-center min-w-0">
            <TabsList className="px-1 py-0 border h-7 sm:h-8">
              <TabsTrigger
                className="font-normal text-xs py-1 px-2 sm:px-3 gap-1 flex items-center"
                value="code"
              >
                {isChatLoading && (
                  <LoaderCircle
                    strokeWidth={3}
                    className="h-3 w-3 animate-spin shrink-0"
                  />
                )}
                <span className="truncate">Code</span>
              </TabsTrigger>
              <TabsTrigger
                disabled={!result}
                className="font-normal text-xs py-1 px-2 sm:px-3 gap-1 flex items-center"
                value="fragment"
              >
                <span className="truncate">Preview</span>
                {isPreviewLoading && (
                  <LoaderCircle
                    strokeWidth={3}
                    className="h-3 w-3 animate-spin shrink-0"
                  />
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          {result && (
            <div className="flex items-center justify-end gap-2 shrink-0">
              {isLinkAvailable && (
                <a
                  href={(result as { url?: string }).url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                >
                  Open
                </a>
              )}
            </div>
          )}
        </div>
        {fragment && (
          <div className="overflow-y-auto w-full h-full flex-1 min-h-0">
            <TabsContent value="code" className="h-full m-0">
              {fragment.code && fragment.file_path && (
                <FragmentCode
                  files={[
                    {
                      name: fragment.file_path,
                      content: fragment.code,
                    },
                  ]}
                />
              )}
            </TabsContent>
            <TabsContent value="fragment" className="h-full m-0">
              {result && <FragmentPreview result={result} />}
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}
