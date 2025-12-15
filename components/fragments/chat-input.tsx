"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
// Dynamic import for react-textarea-autosize
let TextareaAutosize: React.ComponentType<
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minRows?: number;
    maxRows?: number;
  }
>;
try {
  TextareaAutosize = require("react-textarea-autosize").default;
} catch {
  // Fallback to regular textarea
  function TextareaAutosizeFallback(
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
      minRows?: number;
      maxRows?: number;
    },
  ) {
    const { minRows, maxRows, ...rest } = props;
    return <textarea {...rest} rows={minRows || 1} />;
  }
  TextareaAutosizeFallback.displayName = "TextareaAutosizeFallback";
  TextareaAutosize = TextareaAutosizeFallback;
}

export function ChatInput({
  retry,
  isErrored,
  errorMessage,
  isLoading,
  isRateLimited,
  stop,
  input,
  handleInputChange,
  handleSubmit,
  isMultiModal,
  files,
  handleFileChange,
  children,
}: {
  retry: () => void;
  isErrored: boolean;
  errorMessage: string;
  isLoading: boolean;
  isRateLimited: boolean;
  stop: () => void;
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isMultiModal: boolean;
  files: File[];
  handleFileChange: (change: SetStateAction<File[]>) => void;
  children: React.ReactNode;
}) {
  function isFileInArray(file: File, array: File[]): boolean {
    return array.some((f) => f.name === file.name && f.size === file.size);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    handleFileChange((prev) => {
      const newFiles = Array.from(e.target.files || []);
      const uniqueFiles = newFiles.filter((file) => !isFileInArray(file, prev));
      return [...prev, ...uniqueFiles];
    });
  }

  const handleFileRemove = useCallback(
    (file: File) => {
      handleFileChange((prev) => prev.filter((f) => f !== file));
    },
    [handleFileChange],
  );

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items);

    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();

        const file = item.getAsFile();
        if (file) {
          handleFileChange((prev) => {
            if (!isFileInArray(file, prev)) {
              return [...prev, file];
            }
            return prev;
          });
        }
      }
    }
  }

  const [dragActive, setDragActive] = useState(false);

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (droppedFiles.length > 0) {
      handleFileChange((prev) => {
        const uniqueFiles = droppedFiles.filter(
          (file) => !isFileInArray(file, prev),
        );
        return [...prev, ...uniqueFiles];
      });
    }
  }

  const filePreview = useMemo(() => {
    if (files.length === 0) return null;
    return Array.from(files).map((file) => {
      return (
        <div className="relative" key={file.name}>
          <span
            onClick={() => handleFileRemove(file)}
            className="absolute top-[-8] right-[-8] bg-muted rounded-full p-1"
          >
            <X className="h-3 w-3 cursor-pointer" />
          </span>
          <Image
            src={URL.createObjectURL(file)}
            alt={file.name}
            width={40}
            height={40}
            className="rounded-xl w-10 h-10 object-cover"
          />
        </div>
      );
    });
  }, [files, handleFileRemove]);

  function onEnter(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.currentTarget.checkValidity()) {
        handleSubmit(e);
      } else {
        e.currentTarget.reportValidity();
      }
    }
  }

  useEffect(() => {
    if (!isMultiModal) {
      handleFileChange([]);
    }
  }, [isMultiModal, handleFileChange]);

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={onEnter}
      className="mb-2 mt-auto flex flex-col bg-background"
      onDragEnter={isMultiModal ? handleDrag : undefined}
      onDragLeave={isMultiModal ? handleDrag : undefined}
      onDragOver={isMultiModal ? handleDrag : undefined}
      onDrop={isMultiModal ? handleDrop : undefined}
    >
      {isErrored && (
        <div
          className={`flex items-center p-1.5 text-sm font-medium mx-4 mb-10 rounded-xl ${
            isRateLimited
              ? "bg-orange-400/10 text-orange-400"
              : "bg-red-400/10 text-red-400"
          }`}
        >
          <span className="flex-1 px-1.5">{errorMessage}</span>
          <button
            className={`px-2 py-1 rounded-sm ${
              isRateLimited ? "bg-orange-400/20" : "bg-red-400/20"
            }`}
            onClick={retry}
          >
            Try again
          </button>
        </div>
      )}
      <div className="relative">
        <div
          className={`shadow-md rounded-xl sm:rounded-2xl relative z-10 bg-background border ${
            dragActive
              ? "before:absolute before:inset-0 before:rounded-xl sm:before:rounded-2xl before:border-2 before:border-dashed before:border-primary"
              : ""
          }`}
        >
          <div className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 gap-1 flex-wrap">
            {children}
          </div>
          <TextareaAutosize
            autoFocus={true}
            minRows={1}
            maxRows={5}
            className="text-sm sm:text-base px-2 sm:px-3 resize-none ring-0 bg-inherit w-full m-0 outline-none"
            required={true}
            placeholder="Describe your app..."
            disabled={isErrored}
            value={input}
            onChange={handleInputChange}
            onPaste={isMultiModal ? handlePaste : undefined}
          />
          <div className="flex p-2 sm:p-3 gap-1.5 sm:gap-2 items-center">
            <input
              type="file"
              id="multimodal"
              name="multimodal"
              accept="image/*"
              multiple={true}
              className="hidden"
              onChange={handleFileInput}
            />
            <div className="flex items-center flex-1 gap-2">
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      disabled={!isMultiModal || isErrored}
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-lg sm:rounded-xl h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById("multimodal")?.click();
                      }}
                    >
                      <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add attachments</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {files.length > 0 && filePreview}
            </div>
            <div>
              {!isLoading ? (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={isErrored}
                        variant="default"
                        size="icon"
                        type="submit"
                        className="rounded-lg sm:rounded-xl h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                      >
                        <ArrowUp className="h-4 w-4 sm:h-5 sm:w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send message</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="rounded-lg sm:rounded-xl h-9 w-9 sm:h-10 sm:w-10 shrink-0"
                        onClick={(e) => {
                          e.preventDefault();
                          stop();
                        }}
                      >
                        <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Stop generation</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
