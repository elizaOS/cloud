"use client";

import { Chat } from "@/components/fragments/chat";
import { ChatInput } from "@/components/fragments/chat-input";
import { ChatPicker } from "@/components/fragments/chat-picker";
import { ChatSettings } from "@/components/fragments/chat-settings";
import { Preview } from "@/components/fragments/preview";
import { AIAppBuilderDialog } from "@/components/apps/ai-app-builder-dialog";
import { ServiceBuilder } from "@/components/builders/service-builder";
import { usePrivy } from "@privy-io/react-auth";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Save, Rocket, FolderOpen, Zap, Layers, Server } from "lucide-react";
import { useState, useEffect, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LLMModelConfig } from "@/lib/fragments/models";
import modelsList from "@/lib/fragments/models";
import type { FragmentSchema } from "@/lib/fragments/schema";
import templates from "@/lib/fragments/templates";
import type { ExecutionResult } from "@/lib/fragments/types";
import { DeepPartial } from "ai";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { fragmentSchema } from "@/lib/fragments/schema";

type BuilderMode = "quick" | "full_app" | "service";

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // Ignore errors
    }
  };

  return [storedValue, setValue];
}
import { toAISDKMessages, toMessageImage, type Message as MessageType } from "@/lib/fragments/messages";

export default function FragmentsPage() {
  // Builder mode state
  const [builderMode, setBuilderMode] = useLocalStorage<BuilderMode>("fragments-builder-mode", "quick");
  const [showFullAppDialog, setShowFullAppDialog] = useState(false);
  const [showServiceDialog, setShowServiceDialog] = useState(false);

  const [chatInput, setChatInput] = useLocalStorage("fragments-chat", "");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");
  const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
    "fragments-languageModel",
    {
      model: "gpt-4o",
    }
  );

  const { ready, authenticated, user } = usePrivy();

  const [result, setResult] = useState<ExecutionResult>();
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [fragment, setFragment] = useState<DeepPartial<FragmentSchema>>();
  const [currentTab, setCurrentTab] = useState<"code" | "fragment">("code");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const router = useRouter();

  const currentModel =
    modelsList.find((model) => model.id === languageModel.model) ||
    modelsList[0];

  const currentTemplate =
    selectedTemplate === "auto"
      ? templates
      : { [selectedTemplate]: templates[selectedTemplate as keyof typeof templates] };

  const lastMessage = messages[messages.length - 1];

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/fragments/chat",
    schema: fragmentSchema,
    onError: (error) => {
      if (error.message.includes("limit")) {
        setIsRateLimited(true);
      }
      setErrorMessage(error.message);
    },
    onFinish: async ({ object: fragment, error }) => {
      if (!error && fragment) {
        setIsPreviewLoading(true);

        const response = await fetch("/api/fragments/sandbox", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fragment,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          setErrorMessage(errorData.error || "Failed to execute fragment");
          setIsPreviewLoading(false);
          return;
        }

        const result = await response.json();
        setResult(result);
        setCurrentPreview({ fragment, result });
        setMessage({ result });
        setCurrentTab("fragment");
        setIsPreviewLoading(false);
      }
    },
  });

  useEffect(() => {
    if (object) {
      setFragment(object);
      const content: MessageType["content"] = [
        { type: "text", text: object.commentary || "" },
        { type: "code", text: object.code || "" },
      ];

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") {
          return [...prev, { role: "assistant" as const, content, object }];
        }
        const updated = [...prev];
        updated[prev.length - 1] = { ...last, content, object };
        return updated;
      });
    }
  }, [object]);

  useEffect(() => {
    if (error) stop();
  }, [error, stop]);

  function setMessage(message: Partial<MessageType>, index?: number) {
    setMessages((previousMessages) => {
      const updatedMessages = [...previousMessages];
      updatedMessages[index ?? previousMessages.length - 1] = {
        ...previousMessages[index ?? previousMessages.length - 1],
        ...message,
      };

      return updatedMessages;
    });
  }

  async function handleSubmitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!ready || !authenticated) {
      setErrorMessage("Please log in to use fragments");
      return;
    }

    if (isLoading) {
      stop();
      return;
    }

    const content: MessageType["content"] = [{ type: "text", text: chatInput }];
    const images = await toMessageImage(files);

    if (images.length > 0) {
      images.forEach((image) => {
        content.push({ type: "image", image });
      });
    }

    addMessage({
      role: "user",
      content,
    });

    if (!user) return;
    
    submit({
      userID: user.id,
      messages: toAISDKMessages([...messages, { role: "user", content }]),
      template: currentTemplate,
      model: currentModel.id,
      config: languageModel,
    });

    setChatInput("");
    setFiles([]);
    setCurrentTab("code");
  }

  function retry() {
    if (!user) return;
    submit({
      userID: user.id,
      messages: toAISDKMessages(messages),
      template: currentTemplate,
      model: currentModel.id,
      config: languageModel,
    });
  }

  function addMessage(message: MessageType) {
    setMessages((previousMessages) => {
      const updated = [...previousMessages, message];
      return updated;
    });
  }

  function handleSaveInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setChatInput(e.target.value);
  }

  function handleFileChange(change: SetStateAction<File[]>) {
    setFiles(change);
  }

  function handleLanguageModelChange(e: LLMModelConfig) {
    setLanguageModel({ ...languageModel, ...e });
  }

  function handleClearChat() {
    stop();
    setChatInput("");
    setFiles([]);
    setMessages([]);
    setFragment(undefined);
    setResult(undefined);
    setCurrentTab("code");
    setIsPreviewLoading(false);
  }

  function setCurrentPreview(preview: {
    fragment: DeepPartial<FragmentSchema> | undefined;
    result: ExecutionResult | undefined;
  }) {
    setFragment(preview.fragment);
    setResult(preview.result);
  }

  function handleUndo() {
    setMessages((previousMessages) => previousMessages.slice(0, -2));
    setCurrentPreview({ fragment: undefined, result: undefined });
  }

  async function handleSaveProject() {
    if (!fragment || !user) {
      toast.error("Please generate a fragment first");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/v1/fragments/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `Fragment ${new Date().toLocaleDateString()}`,
          description: fragment.commentary || "Generated fragment",
          fragment,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save project");
      }

      const { project } = await response.json();
      setSavedProjectId(project.id);
      toast.success("Project saved successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save project");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeploy() {
    if (!fragment || !user) {
      toast.error("Please generate a fragment first");
      return;
    }

    if (!savedProjectId) {
      toast.error("Please save the project first");
      return;
    }

    setIsDeploying(true);
    try {
      // One-click deployment - no URL needed!
      const response = await fetch(`/api/v1/fragments/projects/${savedProjectId}/deploy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "app",
          autoStorage: true, // Auto-create storage collections
          autoInject: true, // Auto-inject app helpers
          // appUrl is optional - will be auto-generated
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to deploy project");
      }

      const { deployment } = await response.json();
      
      // Show success with details
      const collectionsCount = deployment.collections?.length || 0;
      toast.success(
        `App deployed! ${collectionsCount > 0 ? `${collectionsCount} storage collections created.` : ""}`,
        { duration: 5000 }
      );
      
      router.push(`/dashboard/apps/${deployment.app.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deploy project");
    } finally {
      setIsDeploying(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h1
              className="text-2xl sm:text-3xl md:text-4xl font-normal tracking-tight text-white truncate"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              AI Builder
            </h1>
          </div>
          <p className="text-sm sm:text-base text-white/60 mt-2">
            AI-powered code generation and deployment platform
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:shrink-0">
          {/* Mode Toggle */}
          <div className="flex rounded-lg border border-white/10 p-1 bg-white/5">
            <button
              onClick={() => setBuilderMode("quick")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                builderMode === "quick"
                  ? "bg-[#FF5800] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Quick</span>
            </button>
            <button
              onClick={() => {
                setBuilderMode("full_app");
                setShowFullAppDialog(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                builderMode === "full_app"
                  ? "bg-[#FF5800] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Full App</span>
            </button>
            <button
              onClick={() => {
                setBuilderMode("service");
                setShowServiceDialog(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                builderMode === "service"
                  ? "bg-[#FF5800] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">Service</span>
            </button>
          </div>

          {fragment && (
            <>
              <BrandButton
                variant="hud"
                onClick={handleSaveProject}
                disabled={isSaving}
                className="flex-1 sm:flex-none"
              >
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{savedProjectId ? "Saved" : "Save Project"}</span>
                <span className="sm:hidden">{savedProjectId ? "Saved" : "Save"}</span>
              </BrandButton>
              {savedProjectId && (
                <BrandButton
                  variant="primary"
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="flex-1 sm:flex-none"
                >
                  <Rocket className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Deploy</span>
                </BrandButton>
              )}
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/fragments/projects")}
            className="flex-1 sm:flex-none"
          >
            <FolderOpen className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Projects</span>
            <span className="sm:hidden">Projects</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid w-full grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 flex-1 min-h-0">
        <BrandCard className={`flex flex-col ${fragment ? "lg:col-span-1" : "lg:col-span-2"} min-h-0`}>
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10 gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white truncate">Code Generation</h2>
              <div className="flex gap-1 sm:gap-2 shrink-0">
                {messages.length > 1 && !isLoading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    className="text-xs sm:text-sm text-white/60 hover:text-white px-2 sm:px-3"
                  >
                    <span className="hidden sm:inline">Undo</span>
                    <span className="sm:hidden">↶</span>
                  </Button>
                )}
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearChat}
                    className="text-xs sm:text-sm text-white/60 hover:text-white px-2 sm:px-3"
                  >
                    <span className="hidden sm:inline">Clear</span>
                    <span className="sm:hidden">×</span>
                  </Button>
                )}
              </div>
            </div>
          <Chat
            messages={messages}
            isLoading={isLoading}
            setCurrentPreview={setCurrentPreview}
          />
          <ChatInput
            retry={retry}
            isErrored={error !== undefined}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isRateLimited={isRateLimited}
            stop={stop}
            input={chatInput}
            handleInputChange={handleSaveInputChange}
            handleSubmit={handleSubmitAuth}
            isMultiModal={currentModel?.multiModal || false}
            files={files}
            handleFileChange={handleFileChange}
          >
            <ChatPicker
              templates={templates}
              selectedTemplate={selectedTemplate}
              onSelectedTemplateChange={setSelectedTemplate}
              models={modelsList}
              languageModel={languageModel}
              onLanguageModelChange={handleLanguageModelChange}
            />
            <ChatSettings
              languageModel={languageModel}
              onLanguageModelChange={handleLanguageModelChange}
            />
          </ChatInput>
          </div>
        </BrandCard>
        {fragment && (
          <BrandCard className="flex flex-col flex-1 min-h-0">
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10 flex flex-col flex-1 min-h-0">
              <Preview
                selectedTab={currentTab}
                onSelectedTabChange={setCurrentTab}
                isChatLoading={isLoading}
                isPreviewLoading={isPreviewLoading}
                fragment={fragment}
                result={result}
                onClose={() => setFragment(undefined)}
              />
            </div>
          </BrandCard>
        )}
      </div>
    </div>

    {/* Full App Builder Dialog */}
    <AIAppBuilderDialog
      open={showFullAppDialog}
      onOpenChange={(open) => {
        setShowFullAppDialog(open);
        if (!open) {
          setBuilderMode("quick");
        }
      }}
    />

    {/* Service Builder Dialog */}
    <Dialog
      open={showServiceDialog}
      onOpenChange={(open) => {
        setShowServiceDialog(open);
        if (!open) {
          setBuilderMode("quick");
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Create MCP/A2A Service
          </DialogTitle>
        </DialogHeader>
        <ServiceBuilder
          onSave={() => {
            setShowServiceDialog(false);
            setBuilderMode("quick");
            toast.success("Service created successfully");
          }}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}

