"use client";

import { useState, useCallback } from "react";
import { useSetPageHeader } from "@/components/layout/page-header-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw, 
  HardDrive, 
  FileIcon,
  ExternalLink,
  Copy,
  Loader2,
  Wallet
} from "lucide-react";
import useSWR from "swr";

interface StorageItem {
  id: string;
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeGB: number;
}

interface StoragePricing {
  uploadPerMB: string;
  retrievalPerMB: string;
  pinPerGBMonth: string;
  minUploadFee: string;
}

interface StorageInfoResponse {
  stats: StorageStats;
  pricing: StoragePricing;
  x402Enabled: boolean;
  x402Configured: boolean;
  network: string;
}

interface StorageListResponse {
  items: StorageItem[];
  cursor?: string;
  hasMore: boolean;
  count: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StoragePageClient() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  useSetPageHeader({
    title: "Storage",
    description: "Decentralized storage with x402 micropayments",
    actions: (
      <Badge variant="default" className="text-xs bg-green-600">
        x402 Enabled
      </Badge>
    ),
  });
  
  const { data: info, mutate: mutateInfo } = useSWR<StorageInfoResponse>(
    "/api/v1/storage?stats=true",
    fetcher,
    { refreshInterval: 30000 }
  );
  
  const { data: files, mutate: mutateFiles } = useSWR<StorageListResponse>(
    "/api/v1/storage?limit=50",
    fetcher,
    { refreshInterval: 30000 }
  );
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }, []);
  
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      toast.error("No file selected");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    
    const response = await fetch("/api/v1/storage", {
      method: "POST",
      body: formData,
    });
    
    clearInterval(progressInterval);
    
    if (response.status === 402) {
      const paymentInfo = await response.json();
      toast.info(`Payment required: ${paymentInfo.message}`, {
        description: "Connect wallet to pay with x402",
        action: {
          label: "Learn More",
          onClick: () => window.open("https://x402.org", "_blank"),
        },
      });
      setIsUploading(false);
      setUploadProgress(0);
      return;
    }
    
    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Upload failed");
      setIsUploading(false);
      setUploadProgress(0);
      return;
    }
    
    setUploadProgress(100);
    const result = await response.json();
    
    toast.success("File uploaded successfully", {
      description: `Cost: ${result.costPaid}`,
    });
    
    setSelectedFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    
    // Refresh file list and stats
    mutateFiles();
    mutateInfo();
  }, [selectedFile, mutateFiles, mutateInfo]);
  
  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }, []);
  
  const handleDelete = useCallback(async (item: StorageItem) => {
    const confirmed = window.confirm(`Delete ${item.pathname}?`);
    if (!confirmed) return;
    
    // Use authenticated session for deletion (API accepts both wallet sig and auth)
    const response = await fetch(`/api/v1/storage/${item.id}?url=${encodeURIComponent(item.url)}`, {
      method: "DELETE",
    });
    
    if (response.status === 401) {
      toast.error("Authentication required to delete files");
      return;
    }
    
    if (response.status === 403) {
      toast.error("You can only delete files you uploaded");
      return;
    }
    
    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || "Delete failed");
      return;
    }
    
    toast.success("File deleted");
    mutateFiles();
    mutateInfo();
  }, [mutateFiles, mutateInfo]);
  
  const handleRefresh = useCallback(() => {
    mutateFiles();
    mutateInfo();
    toast.info("Refreshing...");
  }, [mutateFiles, mutateInfo]);
  
  return (
    <div className="flex flex-col gap-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Files</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              {info?.stats.totalFiles ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Storage</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              {info?.stats.totalSizeBytes ? formatBytes(info.stats.totalSizeBytes) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upload Cost</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              {info?.pricing.uploadPerMB ?? "—"}/MB
            </CardTitle>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Network</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              {info?.network === "base" ? "Base Mainnet" : info?.network === "base-sepolia" ? "Base Sepolia" : info?.network ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload File
          </CardTitle>
          <CardDescription>
            Upload files with x402 micropayments. No account required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <Input
                type="file"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="flex-1"
              />
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
            
            {selectedFile && (
              <div className="text-sm text-muted-foreground">
                Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
                {info?.pricing && (
                  <span className="ml-2">
                    • Estimated cost: {info.pricing.minUploadFee} minimum
                  </span>
                )}
              </div>
            )}
            
            {isUploading && (
              <Progress value={uploadProgress} className="h-2" />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* File List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Files</CardTitle>
              <CardDescription>
                Manage your uploaded files
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!files?.items?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              No files uploaded yet. Upload your first file above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">
                          {item.pathname.split("/").pop()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.contentType.split("/").pop()}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatBytes(item.size)}</TableCell>
                    <TableCell>{formatDate(item.uploadedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyUrl(item.url)}
                          title="Copy URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(item.url, "_blank")}
                          title="Open"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item)}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {files?.hasMore && (
            <div className="mt-4 text-center">
              <Button variant="outline" size="sm">
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Pricing Info */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Pay with USDC via x402 protocol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Upload</div>
              <div className="text-lg font-semibold">{info?.pricing.uploadPerMB ?? "—"}/MB</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Retrieval</div>
              <div className="text-lg font-semibold">{info?.pricing.retrievalPerMB ?? "—"}/MB</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">IPFS Pin</div>
              <div className="text-lg font-semibold">{info?.pricing.pinPerGBMonth ?? "—"}/GB/mo</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Minimum</div>
              <div className="text-lg font-semibold">{info?.pricing.minUploadFee ?? "—"}</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            • First 1MB download is free<br />
            • All payments in USDC on {info?.network === "base" ? "Base" : "Base Sepolia"}<br />
            • No account required - pay directly from wallet
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
