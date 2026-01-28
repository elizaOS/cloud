"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Copy, Check, Code2 } from "lucide-react";

interface CodeViewerProps {
  code: string;
  language?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

export function CodeViewer({
  code,
  language = "typescript",
  maxHeight = "400px",
  showLineNumbers = true,
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const lines = code.split("\n");

  return (
    <div className="relative border rounded-lg overflow-hidden bg-zinc-950" data-testid="code-viewer">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <Badge variant="outline" className="text-xs">
            {language}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {lines.length} lines
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Code content */}
      <ScrollArea style={{ maxHeight }} className="p-0">
        <div className="p-4">
          <pre className="text-sm font-mono">
            <code className="text-zinc-100">
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  {showLineNumbers && (
                    <span className="select-none w-8 text-zinc-500 text-right pr-4 shrink-0">
                      {i + 1}
                    </span>
                  )}
                  <span className="whitespace-pre-wrap break-all">
                    {highlightSyntax(line)}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Simple syntax highlighting for TypeScript/JavaScript
 * For production, consider using a library like Prism.js or highlight.js
 */
function highlightSyntax(line: string): React.ReactNode {
  // Keywords
  const keywords = /\b(const|let|var|function|async|await|return|if|else|for|while|class|interface|type|export|import|from|try|catch|throw|new|this)\b/g;
  // Strings
  const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g;
  // Comments
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/g;
  // Numbers
  const numbers = /\b(\d+)\b/g;
  // Function calls
  const functions = /\b([a-zA-Z_]\w*)\s*\(/g;

  // This is a simplified approach - for production use a proper syntax highlighter
  // We'll just return the raw line with basic coloring
  
  // Check if it's a comment
  if (line.trim().startsWith("//") || line.trim().startsWith("/*")) {
    return <span className="text-zinc-500">{line}</span>;
  }

  // Check if it's an import/export statement
  if (line.trim().startsWith("import") || line.trim().startsWith("export")) {
    return <span className="text-purple-400">{line}</span>;
  }

  // Check for function definitions
  if (line.includes("function") || line.includes("async") || line.includes("=>")) {
    return <span className="text-blue-400">{line}</span>;
  }

  // Check for const/let/var declarations
  if (line.trim().startsWith("const") || line.trim().startsWith("let") || line.trim().startsWith("var")) {
    return <span className="text-cyan-400">{line}</span>;
  }

  // Check for return statements
  if (line.trim().startsWith("return")) {
    return <span className="text-yellow-400">{line}</span>;
  }

  // Default
  return line;
}
