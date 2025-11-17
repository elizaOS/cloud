"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/knowledge/document-upload";
import { DocumentList } from "@/components/knowledge/document-list";
import { KnowledgeQuery } from "@/components/knowledge/knowledge-query";

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

interface KnowledgeDrawerProps {
  characterId?: string | null;
}

export function KnowledgeDrawer({ characterId }: KnowledgeDrawerProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      
      // Include characterId in query params if provided
      const url = new URL("/api/v1/knowledge", window.location.origin);
      if (characterId) {
        url.searchParams.set("characterId", characterId);
      }
      
      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error("Failed to fetch documents");
        return;
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Fetch documents when opening the drawer
      fetchDocuments();
    }
  };

  const handleUploadSuccess = () => {
    fetchDocuments();
  };

  const handleDelete = async (documentId: string) => {
    try {
      // Include characterId in query params if provided
      const url = new URL(`/api/v1/knowledge/${documentId}`, window.location.origin);
      if (characterId) {
        url.searchParams.set("characterId", characterId);
      }
      
      const response = await fetch(url.toString(), {
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="h-4 w-4 mr-2" />
          Knowledge (RAG)
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Knowledge Management</SheetTitle>
          <SheetDescription>
            Upload documents to enhance Eliza&apos;s responses with RAG
            (Retrieval-Augmented Generation). Documents are automatically
            searched and relevant content is injected into conversations.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs
            id="knowledge-drawer-tabs"
            defaultValue="upload"
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="query">Query</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4">
              <DocumentUpload 
                onUploadSuccess={handleUploadSuccess}
                characterId={characterId ?? null}
              />
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <DocumentList
                documents={documents}
                loading={loading}
                onDelete={handleDelete}
                onRefresh={fetchDocuments}
              />
            </TabsContent>

            <TabsContent value="query" className="space-y-4">
              <KnowledgeQuery characterId={characterId ?? null} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
