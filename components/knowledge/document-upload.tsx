"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, FileText, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DocumentUploadProps {
  onUploadSuccess: () => void;
}

// Helper function to get correct MIME type based on file extension (from plugin-knowledge)
const getCorrectMimeType = (file: File): string => {
  const filename = file.name.toLowerCase();
  const ext = filename.split(".").pop() || "";

  const mimeTypeMap: Record<string, string> = {
    // Text files
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    csv: "text/csv",
    yaml: "text/yaml",
    yml: "text/yaml",
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Code files - all map to text/plain
    ts: "text/plain",
    tsx: "text/plain",
    js: "text/plain",
    jsx: "text/plain",
    py: "text/plain",
    java: "text/plain",
    c: "text/plain",
    cpp: "text/plain",
    go: "text/plain",
    rs: "text/plain",
  };

  return mimeTypeMap[ext] || file.type || "application/octet-stream";
};

export function DocumentUpload({ onUploadSuccess }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Text upload state
  const [textContent, setTextContent] = useState("");
  const [filename, setFilename] = useState("");

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log(
      "[DocumentUpload] handleFileUpload triggered, selectedFiles:",
      selectedFiles.length,
    );

    if (selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();

      // Append files with corrected MIME types (matching plugin pattern)
      for (const file of selectedFiles) {
        const correctedMimeType = getCorrectMimeType(file);
        const blob = new Blob([file], { type: correctedMimeType });
        formData.append("files", blob, file.name);
        console.log(
          "[DocumentUpload] Added file:",
          file.name,
          "type:",
          correctedMimeType,
        );
      }

      console.log(
        "[DocumentUpload] Making API call to /api/v1/knowledge/upload-file",
      );

      const response = await fetch("/api/v1/knowledge/upload-file", {
        method: "POST",
        body: formData,
      });

      console.log("[DocumentUpload] Response status:", response.status);

      if (!response.ok) {
        const data = await response.json();
        console.error("[DocumentUpload] Upload failed:", data);
        throw new Error(data.error || "Failed to upload files");
      }

      const data = await response.json();
      console.log("[DocumentUpload] Upload successful:", data);
      setSuccess(
        data.message || `Successfully uploaded ${selectedFiles.length} file(s)`,
      );
      setSelectedFiles([]);

      // Reset file input
      const fileInput = document.getElementById(
        "file-input",
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }

      // Notify parent
      onUploadSuccess();
    } catch (err) {
      console.error("[DocumentUpload] Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload files");
    } finally {
      setUploading(false);
    }
  };

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("[DocumentUpload] handleTextUpload triggered");

    if (!textContent.trim()) {
      setError("Please enter some text content");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log("[DocumentUpload] Making API call to /api/v1/knowledge");

      const response = await fetch("/api/v1/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: textContent,
          contentType: "text/plain",
          filename: filename || "text-document.txt",
        }),
      });

      console.log("[DocumentUpload] Response status:", response.status);

      if (!response.ok) {
        const data = await response.json();
        console.error("[DocumentUpload] Upload failed:", data);
        throw new Error(data.error || "Failed to upload text");
      }

      const data = await response.json();
      console.log("[DocumentUpload] Upload successful:", data);
      setSuccess(data.message);
      setTextContent("");
      setFilename("");

      // Notify parent
      onUploadSuccess();
    } catch (err) {
      console.error("[DocumentUpload] Text upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload text");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <Tabs id="document-upload-tabs" defaultValue="file" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file">Upload File</TabsTrigger>
          <TabsTrigger value="text">Paste Text</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-4">
          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <Label htmlFor="file-input">Select Files</Label>
              <Input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.txt,.md,.doc,.docx,.json,.xml,.yaml,.yml,.csv,.html,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    setSelectedFiles(Array.from(files));
                    setError(null);
                    setSuccess(null);
                  }
                }}
                disabled={uploading}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Supported: PDF, TXT, MD, DOC, DOCX, JSON, and code files
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="submit"
              disabled={selectedFiles.length === 0 || uploading}
              onClick={(e) => {
                console.log("[DocumentUpload] Upload button clicked!");
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload{" "}
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} File(s)`
                    : "Files"}
                </>
              )}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="text" className="space-y-4">
          <form onSubmit={handleTextUpload} className="space-y-4">
            <div>
              <Label htmlFor="filename">Document Name (Optional)</Label>
              <Input
                id="filename"
                type="text"
                placeholder="my-document.txt"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                disabled={uploading}
              />
            </div>

            <div>
              <Label htmlFor="text-content">Content</Label>
              <Textarea
                id="text-content"
                placeholder="Paste your text content here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                disabled={uploading}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            <Button
              type="submit"
              disabled={!textContent.trim() || uploading}
              onClick={(e) => {
                console.log("[DocumentUpload] Text upload button clicked!");
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Text
                </>
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
