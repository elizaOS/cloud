import { group, sleep } from "k6";
import { httpGet, httpPostFile, httpDelete } from "../../helpers/http";
import { generateTestFile } from "../../helpers/data-generators";
import {
  filesUploaded,
  filesDownloaded,
  uploadTime,
  downloadTime,
} from "../../helpers/metrics";

interface StorageFile {
  id: string;
  name: string;
}

export function listFiles(limit = 20): StorageFile[] {
  const body = httpGet<{ files: StorageFile[] }>(
    `/api/v1/storage?limit=${limit}`,
    { tags: { endpoint: "storage" } },
  );
  return body?.files ?? [];
}

export function uploadFile(): string | null {
  const file = generateTestFile();
  const start = Date.now();
  const body = httpPostFile<{ id?: string; fileId?: string }>(
    "/api/v1/storage",
    file,
    { tags: { endpoint: "storage" } },
  );
  uploadTime.add(Date.now() - start);
  if (!body) return null;
  filesUploaded.add(1);
  return body.id ?? body.fileId ?? null;
}

export function getFileMetadata(fileId: string): StorageFile | null {
  return httpGet<StorageFile>(`/api/v1/storage/${fileId}`, {
    tags: { endpoint: "storage" },
  });
}

export function downloadFile(fileId: string): boolean {
  const start = Date.now();
  const body = httpGet(`/api/v1/storage/${fileId}/download`, {
    tags: { endpoint: "storage" },
  });
  downloadTime.add(Date.now() - start);
  if (!body) return false;
  filesDownloaded.add(1);
  return true;
}

export function deleteFile(fileId: string): boolean {
  return httpDelete(`/api/v1/storage/${fileId}`, {
    tags: { endpoint: "storage" },
  });
}

export function storageOperationsCycle() {
  group("Storage CRUD", () => {
    listFiles();
    sleep(0.5);
    const fileId = uploadFile();
    if (!fileId) return;
    sleep(0.5);
    getFileMetadata(fileId);
    sleep(0.5);
    downloadFile(fileId);
    sleep(0.5);
    deleteFile(fileId);
  });
  sleep(1);
}

export function storageReadOnly() {
  group("Storage Read", () => {
    const files = listFiles();
    if (files.length > 0)
      getFileMetadata(files[Math.floor(Math.random() * files.length)].id);
  });
  sleep(0.5);
}

export default function main() {
  storageOperationsCycle();
}
