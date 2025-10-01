import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";

export const metadata: Metadata = {
  title: "Text & Chat Generation",
  description: "Generate AI-powered text and engage in intelligent conversations with advanced language models",
};

export default function TextPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Text & Chat</h1>
        <p className="text-muted-foreground mt-2">
          Generate text and engage in AI conversations powered by ElizaOS
        </p>
      </div>

      <ChatInterface />
    </div>
  );
}

