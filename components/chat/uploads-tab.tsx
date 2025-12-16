"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { KnowledgeDocument, PreUploadedFile } from "@/lib/types/knowledge";

interface UploadsTabProps {
  characterId: string | null;
  onPreUploadedFilesChange?: (files: PreUploadedFile[]) => void;
}

export function UploadsTab({ characterId, onPreUploadedFilesChange }: UploadsTabProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [preUploadedFiles, setPreUploadedFiles] = useState<PreUploadedFile[]>([]);

  const fetchDocuments = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);

    const url = new URL("/api/v1/knowledge", window.location.origin);
    url.searchParams.set("characterId", characterId);

    const response = await fetch(url.toString());
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

  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setSelectedFiles(files);
    
    const formData = new FormData();
    
    // Pre-upload mode: upload to blob storage only (no characterId yet)
    if (!characterId) {
      for (const file of files) {
        formData.append("files", file, file.name);
      }

      const response = await fetch("/api/v1/knowledge/pre-upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const newFiles = data.files as PreUploadedFile[];
        
        setPreUploadedFiles((prev) => [...prev, ...newFiles]);
        onPreUploadedFilesChange?.([...preUploadedFiles, ...newFiles]);
        
        toast.success("Files uploaded successfully", {
          description: `${data.successCount} file(s) uploaded. They will be processed when you save the character.`,
        });
        setSelectedFiles([]);
        const fileInput = document.getElementById(
          "uploads-tab-file-input",
        ) as HTMLInputElement;
        if (fileInput) fileInput.value = "";
      } else {
        const data = await response.json();
        toast.error("Upload failed", {
          description: data.error || "Failed to upload files",
        });
        setSelectedFiles([]);
      }
      setUploading(false);
      return;
    }

    // Normal mode: process files through knowledge service
    formData.append("characterId", characterId);
    for (const file of files) {
      formData.append("files", file, file.name);
    }

    const response = await fetch("/api/v1/knowledge/upload-file", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      toast.success("Files uploaded successfully", {
        description: `${data.successCount} file(s) processed and ready to use`,
      });
      setSelectedFiles([]);
      const fileInput = document.getElementById(
        "uploads-tab-file-input",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      fetchDocuments();
    } else {
      const data = await response.json();
      toast.error("Upload failed", {
        description: data.error || "Failed to upload files",
      });
      setSelectedFiles([]);
    }
    setUploading(false);
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

    const response = await fetch(url.toString(), { method: "DELETE" });
    if (response.ok) {
      toast.success("Document deleted");
      fetchDocuments();
    } else {
      toast.error("Failed to delete document");
    }
  };

  const handleDeletePreUpload = (fileId: string) => {
    const updatedFiles = preUploadedFiles.filter((f) => f.id !== fileId);
    setPreUploadedFiles(updatedFiles);
    onPreUploadedFilesChange?.(updatedFiles);
    toast.success("File removed");
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
  const displayFiles = isPreUploadMode ? preUploadedFiles : documents;
  const displayCount = displayFiles.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">
          Files
        </h3>
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
                <p className="text-sm text-white/80 font-medium">Uploading files...</p>
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
            {displayCount} {isPreUploadMode ? "file" : "document"}{displayCount !== 1 ? "s" : ""}{" "}
            {isPreUploadMode ? "ready to process" : "uploaded"}
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
        ) : displayCount === 0 ? (
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
              : documents.map((doc) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
