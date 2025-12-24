"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { KnowledgeDocument, PreUploadedFile, KnowledgeUploadBatchResponse } from "@/lib/types/knowledge";
import { KNOWLEDGE_CONSTANTS } from "@/lib/constants/knowledge";

interface ProcessingFile {
  id: string;
  filename: string;
  uploadedAt: number;
}

interface UploadsTabProps {
  characterId: string | null;
  preUploadedFiles?: PreUploadedFile[];
  onPreUploadedFilesAdd?: (files: PreUploadedFile[]) => void;
  onPreUploadedFileRemove?: (fileId: string) => void;
}

export function UploadsTab({
  characterId,
  preUploadedFiles = [],
  onPreUploadedFilesAdd,
  onPreUploadedFileRemove,
}: UploadsTabProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);

  // Track concurrent uploads to prevent premature "uploading = false" state
  const activeUploadsRef = useRef(0);

  const fetchDocuments = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);

    const url = new URL("/api/v1/knowledge", window.location.origin);
    url.searchParams.set("characterId", characterId);

    const response = await fetch(url.toString(), { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      setDocuments(data.documents || []);
    }
    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    if (characterId) {
      // Schedule fetch to avoid synchronous setState in effect
      const rafId = requestAnimationFrame(() => {
        void fetchDocuments();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [characterId, fetchDocuments]);

  // Clear processing files when documents are refreshed (they're now in the documents list)
  useEffect(() => {
    if (documents.length > 0 && processingFiles.length > 0) {
      const docFilenames = new Set(
        documents.map((d) => d.metadata?.fileName || d.metadata?.originalFilename)
      );
      setProcessingFiles((prev) =>
        prev.filter((f) => !docFilenames.has(f.filename))
      );
    }
  }, [documents, processingFiles.length]);

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;

    // Validate pre-upload mode requirements BEFORE entering tracked upload state
    // This avoids incrementing counter and setting uploading=true for invalid operations
    if (!characterId && !onPreUploadedFilesAdd) {
      toast.error("Cannot upload files", {
        description: "File tracking is not configured for this view",
      });
      return;
    }

    activeUploadsRef.current++;
    setUploading(true);
    setSelectedFiles(files);

    try {
      const formData = new FormData();

      // Pre-upload mode: upload to blob storage only (no characterId yet)
      if (!characterId) {
        for (const file of files) {
          formData.append("files", file, file.name);
        }

        const response = await fetch("/api/v1/knowledge/pre-upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          const newFiles = data.files as PreUploadedFile[];

          // Use add callback - parent uses functional update to avoid stale closure issues
          // Non-null assertion safe: validated before entering upload state
          onPreUploadedFilesAdd!(newFiles);

          toast.success("Files uploaded successfully", {
            description: `${data.successCount} file(s) uploaded. They will be processed when you save the character.`,
          });
          setSelectedFiles([]);
          const fileInput = document.getElementById(
            "uploads-tab-file-input",
          ) as HTMLInputElement;
          if (fileInput) fileInput.value = "";
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error("Upload failed", {
            description: data.error || "Failed to upload files",
          });
          setSelectedFiles([]);
        }
        return;
      }

      // Validate batch size before upload
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE) {
        const maxMB = KNOWLEDGE_CONSTANTS.MAX_BATCH_SIZE / 1024 / 1024;
        toast.error(`Batch size exceeds ${maxMB}MB limit`, {
          description: "Upload fewer or smaller files",
        });
        setSelectedFiles([]);
        activeUploadsRef.current--;
        if (activeUploadsRef.current === 0) {
          setUploading(false);
        }
        return;
      }

      // Normal mode: process files through knowledge service
      formData.append("characterId", characterId);
      for (const file of files) {
        formData.append("files", file, file.name);
      }

      const response = await fetch("/api/v1/knowledge/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.ok) {
        const data: KnowledgeUploadBatchResponse = await response.json();
        const { summary, files: uploadedFiles } = data;
        
        if (summary.queued > 0) {
          // Show files as processing in the list
          const newProcessing: ProcessingFile[] = uploadedFiles
            .filter((f) => f.isQueued)
            .map((f) => ({
              id: f.jobId || f.id,
              filename: f.filename,
              uploadedAt: f.uploadedAt,
            }));
          setProcessingFiles((prev) => [...prev, ...newProcessing]);
          
          toast.loading(`Processing ${summary.queued} file(s)...`, {
            id: "knowledge-processing",
            description: "This may take a moment for large files",
          });
          
          // Wait for processing to complete
          const processResponse = await fetch("/api/v1/knowledge/process-queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          
          if (processResponse.ok) {
            const processResult = await processResponse.json();
            toast.success("Files processed!", {
              id: "knowledge-processing",
              description: `${processResult.successCount} file(s) ready`,
            });
            setProcessingFiles([]);
            fetchDocuments();
          } else {
            toast.error("Processing failed", {
              id: "knowledge-processing",
              description: "Some files may not have been processed",
            });
          }
        }
        
        if (summary.failed > 0) {
          toast.error(`${summary.failed} file(s) failed to upload`);
        }
        
        setSelectedFiles([]);
        const fileInput = document.getElementById(
          "uploads-tab-file-input",
        ) as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error("Upload failed", {
          description: data.message || data.error || "Failed to upload files",
        });
        setSelectedFiles([]);
      }
    } finally {
      activeUploadsRef.current--;
      // Only set uploading to false when all concurrent uploads have completed
      if (activeUploadsRef.current === 0) {
        setUploading(false);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && !uploading) {
      handleUpload(files);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!characterId) return;

    const url = new URL(
      `/api/v1/knowledge/${documentId}`,
      window.location.origin,
    );
    url.searchParams.set("characterId", characterId);

    const response = await fetch(url.toString(), {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      toast.success("Document deleted");
      fetchDocuments();
    } else {
      toast.error("Failed to delete document");
    }
  };

  const handleDeletePreUpload = async (fileId: string) => {
    const fileToDelete = preUploadedFiles.find((f) => f.id === fileId);
    if (!fileToDelete) return;

    // Fail fast if callbacks aren't provided - deletion would work but UI state wouldn't update
    if (!onPreUploadedFileRemove || !onPreUploadedFilesAdd) {
      toast.error("Cannot delete file", {
        description: "File tracking is not configured for this view",
      });
      return;
    }

    // Optimistically update UI - parent uses functional update to avoid stale closure issues
    onPreUploadedFileRemove(fileId);

    // Delete blob from storage
    try {
      const response = await fetch("/api/v1/knowledge/pre-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ blobUrl: fileToDelete.blobUrl }),
      });

      if (!response.ok) {
        // Restore the file since deletion failed
        onPreUploadedFilesAdd([fileToDelete]);
        toast.error("Failed to delete file");
        return;
      }

      toast.success("File removed");
    } catch {
      // Restore the file on network error
      onPreUploadedFilesAdd([fileToDelete]);
      toast.error("Failed to delete file");
    }
  };

  const getDocumentName = (doc: KnowledgeDocument): string => {
    return (
      doc.metadata?.fileName ||
      doc.metadata?.originalFilename ||
      `Document ${doc.id.slice(0, 8)}`
    );
  };

  const getDocumentAge = (doc: KnowledgeDocument): string => {
    const timestamp = doc.metadata?.uploadedAt || doc.createdAt;
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  // Show pre-upload mode when no characterId
  const isPreUploadMode = !characterId;
  const totalCount = isPreUploadMode
    ? preUploadedFiles.length
    : documents.length + processingFiles.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Files</h3>
        <p className="text-sm text-white/60">
          Upload documents to give your agent context and information.
        </p>
      </div>

      {/* Upload Section */}
      <div className="space-y-4">
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative border-2 border-dashed border-white/10 rounded-lg hover:border-white/20 transition-colors"
        >
          <Input
            id="uploads-tab-file-input"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.doc,.docx,.json,.xml,.yaml,.yml,.csv"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                handleUpload(Array.from(files));
              }
            }}
            disabled={uploading}
            className="hidden"
          />
          <div
            onClick={() => {
              if (!uploading) {
                document.getElementById("uploads-tab-file-input")?.click();
              }
            }}
            className={`p-8 text-center cursor-pointer ${uploading ? "opacity-50" : ""}`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
                <p className="text-sm text-white/80 font-medium">
                  Uploading files...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-white/5">
                  <Upload className="h-6 w-6 text-white/60" />
                </div>
                <div>
                  <p className="text-sm text-white/80 font-medium mb-1">
                    Drop files here or{" "}
                    <span className="text-[#FF5800]">browse</span>
                  </p>
                  <p className="text-xs text-white/40">
                    PDF, TXT, MD, DOC, DOCX, JSON, XML, YAML, CSV
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-white/40 text-center">
          Files upload automatically after selection
        </p>
      </div>

      {/* Documents List */}
      <div className="border-t border-white/10 pt-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-white/60">
            {totalCount} {isPreUploadMode ? "file" : "document"}
            {totalCount !== 1 ? "s" : ""}{" "}
            {isPreUploadMode ? "ready to process" : ""}
            {processingFiles.length > 0 && !isPreUploadMode && (
              <span className="text-[#FF5800] ml-1">
                ({processingFiles.length} processing)
              </span>
            )}
          </span>
          {!isPreUploadMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDocuments}
              disabled={loading}
              className="text-white/50 hover:text-white hover:bg-white/5"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-lg">
            <FileText className="h-12 w-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 mb-1">No files uploaded yet</p>
            <p className="text-xs text-white/30">
              {isPreUploadMode
                ? "Upload files now - they'll be processed when you save the character"
                : "Upload files to give your agent context"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {isPreUploadMode
              ? preUploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg group hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2 bg-white/5 rounded-lg">
                        <FileText className="h-5 w-5 text-white/40" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/90 truncate">
                          {file.filename}
                        </p>
                        <p className="text-xs text-white/40">
                          {formatDistanceToNow(new Date(file.uploadedAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePreUpload(file.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              : (
                <>
                  {/* Processing files (shown first with spinner) */}
                  {processingFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 bg-[#FF5800]/5 border border-[#FF5800]/20 rounded-lg"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2 bg-[#FF5800]/10 rounded-lg">
                          <Loader2 className="h-5 w-5 text-[#FF5800] animate-spin" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white/90 truncate">
                            {file.filename}
                          </p>
                          <p className="text-xs text-[#FF5800]">
                            Processing...
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Completed documents */}
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg group hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="p-2 bg-white/5 rounded-lg">
                          <FileText className="h-5 w-5 text-white/40" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white/90 truncate">
                            {getDocumentName(doc)}
                          </p>
                          <p className="text-xs text-white/40">
                            {getDocumentAge(doc)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
