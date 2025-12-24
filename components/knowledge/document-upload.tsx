/**
 * Document upload component for knowledge base.
 * Supports file uploads up to 6MB per file and 6MB total batch:
 * - Files ≤ 1.5MB: Processed immediately
 * - Files > 1.5MB: Queued for background processing
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import type { KnowledgeUploadBatchResponse, KnowledgeUploadResult } from "@/lib/types/knowledge";

interface DocumentUploadProps {
  onUploadSuccess: () => void;
  characterId: string | null;
}

interface QueuedUpload {
  jobId: string;
  filename: string;
  size: number;
  status: string;
}

const MAX_BATCH_SIZE = 6 * 1024 * 1024; // 6MB total per batch

const getCorrectMimeType = (file: File): string => {
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const mimeTypeMap: Record<string, string> = {
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
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function DocumentUpload({ onUploadSuccess, characterId }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadResults, setUploadResults] = useState<KnowledgeUploadResult[] | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [textContent, setTextContent] = useState("");
  const [filename, setFilename] = useState("");

  // Poll for queued upload status
  const pollQueuedUploads = useCallback(async () => {
    if (queuedUploads.length === 0) return;

    const pendingJobs = queuedUploads.filter(
      (u) => u.status === "pending" || u.status === "in_progress"
    );
    if (pendingJobs.length === 0) return;

    const params = new URLSearchParams();
    if (characterId) params.set("characterId", characterId);

    const response = await fetch(`/api/v1/knowledge/upload?${params}`);
    if (!response.ok) return;

    const data = await response.json();
    const uploadStatuses = data.uploads as Array<{
      id: string;
      status: string;
      filename: string;
      size: number;
    }>;

    setQueuedUploads((prev) =>
      prev.map((upload) => {
        const updated = uploadStatuses.find((u) => u.id === upload.jobId);
        if (updated) {
          return { ...upload, status: updated.status };
        }
        return upload;
      })
    );

    // Refresh document list if any completed
    const newlyCompleted = uploadStatuses.some(
      (u) =>
        u.status === "completed" &&
        queuedUploads.find((q) => q.jobId === u.id)?.status !== "completed"
    );
    if (newlyCompleted) {
      onUploadSuccess();
    }
  }, [queuedUploads, characterId, onUploadSuccess]);

  useEffect(() => {
    const hasPending = queuedUploads.some(
      (u) => u.status === "pending" || u.status === "in_progress"
    );
    if (!hasPending) return;

    const interval = setInterval(pollQueuedUploads, 3000);
    return () => clearInterval(interval);
  }, [queuedUploads, pollQueuedUploads]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && !uploading) {
      setError(null);
      setUploadResults(null);
      handleFileUpload(files);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) {
      setError("Please select at least one file");
      return;
    }

    // Validate total batch size (6MB limit per batch)
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_BATCH_SIZE) {
      setError(
        `Batch size ${formatFileSize(totalSize)} exceeds ${formatFileSize(MAX_BATCH_SIZE)} limit. Upload fewer or smaller files, then upload more after.`
      );
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResults(null);
    setSelectedFiles(files);

    const formData = new FormData();
    if (characterId) {
      formData.append("characterId", characterId);
    }

    for (const file of files) {
      const correctedMimeType = getCorrectMimeType(file);
      const blob = new Blob([file], { type: correctedMimeType });
      formData.append("files", blob, file.name);
    }

    const response = await fetch("/api/v1/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const data: KnowledgeUploadBatchResponse = await response.json();

    if (!response.ok) {
      setError(data.message || "Failed to upload files");
      setUploading(false);
      setSelectedFiles([]);
      return;
    }

    setUploadResults(data.files);

    // Track queued uploads for polling
    const queued = data.files.filter((f) => f.isQueued && f.jobId);
    if (queued.length > 0) {
      setQueuedUploads((prev) => [
        ...prev,
        ...queued.map((f) => ({
          jobId: f.jobId!,
          filename: f.filename,
          size: f.size,
          status: f.status,
        })),
      ]);
    }

    setSelectedFiles([]);
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";

    // Notify parent if any uploads were queued (all uploads are now background processed)
    if (data.summary.queued > 0) {
      onUploadSuccess();
    }

    setUploading(false);
  };

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textContent.trim()) {
      setError("Please enter some text content");
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResults(null);

    const response = await fetch("/api/v1/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: textContent,
        contentType: "text/plain",
        filename: filename || "text-document.txt",
        characterId: characterId || undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Failed to upload text");
      setUploading(false);
      return;
    }

    const docName = filename || "text-document.txt";
    setUploadResults([
      {
        id: crypto.randomUUID(),
        filename: docName,
        size: new Blob([textContent]).size,
        contentType: "text/plain",
        status: "completed",
        isQueued: false,
        uploadedAt: Date.now(),
      },
    ]);

    setTextContent("");
    setFilename("");
    onUploadSuccess();
    setUploading(false);
  };

  const dismissQueuedUpload = (jobId: string) => {
    setQueuedUploads((prev) => prev.filter((u) => u.jobId !== jobId));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "pending":
      case "in_progress":
        return <Clock className="h-4 w-4 text-amber-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {uploadResults && (
        <Alert
          className={
            uploadResults.every((r) => r.status === "completed" || r.isQueued)
              ? "border-green-500 bg-green-50 dark:bg-green-950"
              : "border-amber-500 bg-amber-50 dark:bg-amber-950"
          }
        >
          <div className="space-y-2">
            {uploadResults.map((result) => (
              <div key={result.id || result.filename} className="flex items-center gap-2">
                {getStatusIcon(result.status)}
                <span className="text-sm flex-1">{result.filename}</span>
                <span className="text-xs text-muted-foreground">
                  {result.isQueued ? "Queued" : result.status}
                </span>
              </div>
            ))}
          </div>
        </Alert>
      )}

      {/* Queued uploads tracking */}
      {queuedUploads.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Background Processing</p>
          {queuedUploads.map((upload) => (
            <div
              key={upload.jobId}
              className="flex items-center gap-2 p-3 bg-muted rounded-lg"
            >
              {getStatusIcon(upload.status)}
              <div className="flex-1">
                <p className="text-sm font-medium">{upload.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(upload.size)} •{" "}
                  {upload.status === "pending"
                    ? "Waiting..."
                    : upload.status === "in_progress"
                      ? "Processing..."
                      : upload.status === "completed"
                        ? "Complete"
                        : "Failed"}
                </p>
              </div>
              {(upload.status === "completed" || upload.status === "failed") && (
                <button
                  onClick={() => dismissQueuedUpload(upload.jobId)}
                  className="p-1 hover:bg-background rounded"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Tabs id="document-upload-tabs" defaultValue="file" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file">Upload File</TabsTrigger>
          <TabsTrigger value="text">Paste Text</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-4">
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="relative border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              <Input
                id="file-input"
                type="file"
                multiple
                accept=".pdf,.txt,.md,.doc,.docx,.json,.xml,.yaml,.yml,.csv"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    setError(null);
                    setUploadResults(null);
                    handleFileUpload(Array.from(files));
                  }
                }}
                disabled={uploading}
                className="hidden"
              />
              <div
                onClick={() => {
                  if (!uploading) {
                    document.getElementById("file-input")?.click();
                  }
                }}
                className={`p-8 text-center cursor-pointer ${uploading ? "opacity-50" : ""}`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-foreground font-medium">
                      Uploading {selectedFiles.length} file(s)...
                    </p>
                    <Progress value={50} className="w-48" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-muted">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground font-medium mb-1">
                        Drop files here or <span className="text-primary">browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, TXT, MD, DOC, DOCX, JSON, XML, YAML, CSV
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Max 6MB per batch • Upload more after current batch
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ))}
              </div>
            )}
          </div>
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

            <Button type="submit" disabled={!textContent.trim() || uploading}>
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
