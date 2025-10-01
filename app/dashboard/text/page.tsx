import type { Metadata } from "next";

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
          Generate text and engage in AI conversations
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold mb-4">Text Generation Studio</h2>
        <p className="text-muted-foreground">
          Text generation interface coming soon...
        </p>
      </div>
    </div>
  );
}

