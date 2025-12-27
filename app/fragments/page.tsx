"use client";

import { Chat } from "@/components/fragments/chat";
import { ChatInput } from "@/components/fragments/chat-input";
import { ChatPicker } from "@/components/fragments/chat-picker";
import { ChatSettings } from "@/components/fragments/chat-settings";
import { Preview } from "@/components/fragments/preview";
import { usePrivy } from "@privy-io/react-auth";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Save, Rocket, FolderOpen } from "lucide-react";
import { useState, useEffect, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LLMModelConfig } from "@/lib/fragments/models";
import modelsList from "@/lib/fragments/models";
import { fragmentSchema, type FragmentSchema } from "@/lib/fragments/schema";
import templates from "@/lib/fragments/templates";
import type { ExecutionResult } from "@/lib/fragments/types";
import { DeepPartial } from "ai";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import {
  toAISDKMessages,
  toMessageImage,
  type Message as MessageType,
} from "@/lib/fragments/messages";

function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T) => void] {
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
    setStoredValue(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  };

  return [storedValue, setValue];
}

export default function FragmentsPage() {
  const [chatInput, setChatInput] = useLocalStorage("fragments-chat", "");
  const [files, setFiles] = useState<File[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");
  const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
    "fragments-languageModel",
    {
      model: "gpt-4o",
    },
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
      : {
          [selectedTemplate]:
            templates[selectedTemplate as keyof typeof templates],
        };

  const lastMessage = messages[messages.length - 1];

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/fragments/chat",
    schema: fragmentSchema,
    onError: (error) => {
      if (error.message.includes("limit")) setIsRateLimited(true);
      setErrorMessage(error.message);
    },
    onFinish: async ({ object: fragment, error }) => {
      if (!error && fragment) {
        setIsPreviewLoading(true);
        try {
          const response = await fetch("/api/fragments/sandbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fragment, userID: user?.id }),
          });
          const result = await response.json();
          setResult(result);
          setCurrentPreview({ fragment, result });
          setMessage({ result });
          setCurrentTab("fragment");
        } catch {
          setErrorMessage("Failed to execute fragment");
        } finally {
          setIsPreviewLoading(false);
        }
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

    const updatedMessages = addMessage({
      role: "user",
      content,
    });

    submit({
      userID: user?.id,
      messages: toAISDKMessages(updatedMessages),
      template: currentTemplate,
      model: currentModel.id,
      config: languageModel,
    });

    setChatInput("");
    setFiles([]);
    setCurrentTab("code");
  }

  function retry() {
    submit({
      userID: user?.id,
      messages: toAISDKMessages(messages),
      template: currentTemplate,
      model: currentModel.id,
      config: languageModel,
    });
  }

  function addMessage(message: MessageType) {
    setMessages((previousMessages) => [...previousMessages, message]);
    return [...messages, message];
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
      toast.error(
        error instanceof Error ? error.message : "Failed to save project",
      );
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
      const appUrl = prompt("Enter app URL for deployment:");
      if (!appUrl) {
        setIsDeploying(false);
        return;
      }

      const response = await fetch(
        `/api/v1/fragments/projects/${savedProjectId}/deploy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "app",
            appUrl,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to deploy project");
      }

      const { deployment } = await response.json();
      toast.success("Project deployed successfully!");
      router.push(`/dashboard/apps/${deployment.app.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to deploy project",
      );
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
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "#FF5800" }}
            />
            <h1
              className="text-4xl font-normal tracking-tight text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              Fragments
            </h1>
          </div>
          <p className="text-white/60 mt-2">
            AI-powered code generation and deployment platform
          </p>
        </div>
        <div className="flex gap-2">
          {fragment && (
            <>
              <BrandButton
                variant="hud"
                onClick={handleSaveProject}
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {savedProjectId ? "Saved" : "Save Project"}
              </BrandButton>
              {savedProjectId && (
                <BrandButton
                  variant="primary"
                  onClick={handleDeploy}
                  disabled={isDeploying}
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy
                </BrandButton>
              )}
            </>
          )}
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/fragments/projects")}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Projects
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid w-full md:grid-cols-2 gap-6">
        <BrandCard
          className={`flex flex-col ${fragment ? "col-span-1" : "col-span-2"}`}
        >
          <CornerBrackets size="sm" className="opacity-20" />
          <div className="relative z-10 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">
                Code Generation
              </h2>
              <div className="flex gap-2">
                {messages.length > 1 && !isLoading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    className="text-sm text-white/60 hover:text-white"
                  >
                    Undo
                  </Button>
                )}
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearChat}
                    className="text-sm text-white/60 hover:text-white"
                  >
                    Clear
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
          <BrandCard>
            <CornerBrackets size="sm" className="opacity-20" />
            <div className="relative z-10">
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
  );
}
