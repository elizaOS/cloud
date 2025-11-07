"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "./document-upload";
import { DocumentList } from "./document-list";
import { KnowledgeQuery } from "./knowledge-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";

interface KnowledgeDocument {
  id: string;
  content: {
    text: string;
  };
  createdAt: number;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    uploadedBy?: string;
    uploadedAt?: number;
    originalFilename?: string;
  };
}

export function KnowledgePageClient() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState(true);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/v1/knowledge");

      if (response.status === 503) {
        const data = await response.json();
        setError(data.error || "Knowledge service is not available");
        setServiceAvailable(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.details || data.error || "Failed to fetch documents",
        );
      }

      const data = await response.json();
      setDocuments(data.documents || []);
      setServiceAvailable(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      console.error("Error fetching documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUploadSuccess = () => {
    fetchDocuments();
  };

  const handleDelete = async (documentId: string) => {
    try {
      const response = await fetch(`/api/v1/knowledge/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      // Refresh the list
      fetchDocuments();
    } catch (err) {
      console.error("Error deleting document:", err);
      alert(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  if (!serviceAvailable && !loading) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your RAG knowledge base. Upload documents and query them for
            enhanced AI responses.
          </p>
        </div>

        <Alert variant="destructive">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold">Knowledge service is not available</p>
            {error && <p className="text-sm">{error}</p>}
            <p className="text-sm mt-2">
              The knowledge plugin may not be properly initialized. This can
              happen if:
            </p>
            <ul className="text-sm list-disc list-inside space-y-1 mt-2">
              <li>The agent runtime hasn&apos;t been initialized yet</li>
              <li>
                The knowledge plugin isn&apos;t loaded in the agent
                configuration
              </li>
              <li>
                Required environment variables (like OPENAI_API_KEY) are missing
              </li>
            </ul>
            <p className="text-sm mt-3">
              <strong>Tip:</strong> Try visiting the{" "}
              <a href="/dashboard/chat" className="underline">
                Chat
              </a>{" "}
              page first to initialize the runtime, then come back here.
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage your RAG knowledge base. Upload documents and query them for
          enhanced AI responses.
        </p>
      </div>

      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="query">Query</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : (
                <DocumentList
                  documents={documents}
                  loading={loading}
                  onDelete={handleDelete}
                  onRefresh={fetchDocuments}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUpload onUploadSuccess={handleUploadSuccess} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="query" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Query Knowledge Base</CardTitle>
            </CardHeader>
            <CardContent>
              <KnowledgeQuery />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
