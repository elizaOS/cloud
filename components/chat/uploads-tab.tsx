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
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { KnowledgeDocument } from "@/lib/types/knowledge";

interface UploadsTabProps {
  characterId: string | null;
}

export function UploadsTab({ characterId }: UploadsTabProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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

  const handleUpload = async () => {
    if (!characterId || selectedFiles.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("characterId", characterId);

    for (const file of selectedFiles) {
      formData.append("files", file, file.name);
    }

    const response = await fetch("/api/v1/knowledge/upload-file", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      toast.success("Files uploaded successfully", {
        description: `${data.successCount} file(s) processed and added to knowledge base`,
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
    }
    setUploading(false);
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

  if (!characterId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-white/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Save Character First
          </h3>
          <p className="text-sm text-white/60">
            Please save your character before uploading knowledge documents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Knowledge Base</h3>
        <p className="text-sm text-white/60">
          Upload documents to give your agent knowledge for RAG.
        </p>
      </div>

      {/* Upload Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Input
            id="uploads-tab-file-input"
            type="file"
            multiple
            accept=".pdf,.txt,.md,.doc,.docx,.json,.xml,.yaml,.yml,.csv"
            onChange={(e) => {
              const files = e.target.files;
              if (files) setSelectedFiles(Array.from(files));
            }}
            disabled={uploading}
            className="flex-1 bg-black/40 border-white/10 text-white/80 file:bg-white/5 file:border-0 file:text-white/60 file:mr-3"
          />
          <Button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || uploading}
            className="bg-[#FF5800] hover:bg-[#FF5800]/90 text-white shrink-0"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>

        {selectedFiles.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            {selectedFiles.length} file(s) selected
          </div>
        )}

        <p className="text-xs text-white/40">
          Supported: PDF, TXT, MD, DOC, DOCX, JSON, XML, YAML, CSV
        </p>
      </div>

      {/* Documents List */}
      <div className="border-t border-white/10 pt-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-white/60">
            {documents.length} document{documents.length !== 1 ? "s" : ""}{" "}
            uploaded
          </span>
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-white/40" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-lg">
            <FileText className="h-12 w-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 mb-1">No documents uploaded yet</p>
            <p className="text-xs text-white/30">
              Upload files to build your agent&apos;s knowledge base
            </p>
          </div>
        ) : (
          <div className="space-y-2">
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
          </div>
        )}
      </div>
    </div>
  );
}
