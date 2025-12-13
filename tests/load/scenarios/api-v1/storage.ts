import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { generateTestFile } from "../../helpers/data-generators";
import { filesUploaded, filesDownloaded, uploadTime, downloadTime, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

interface StorageFile { id: string; name: string }

export function listFiles(limit = 20): StorageFile[] {
  const res = http.get(`${baseUrl}/api/v1/storage?limit=${limit}`, { headers, tags: { endpoint: "storage" } });
  if (!check(res, { "list 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ files: StorageFile[] }>(res).files || [];
}

export function uploadFile(): string | null {
  const file = generateTestFile();
  const start = Date.now();
  const res = http.post(
    `${baseUrl}/api/v1/storage`,
    { file: http.file(file.content, file.name, file.mimeType) },
    { headers: { Authorization: headers.Authorization }, tags: { endpoint: "storage" } }
  );
  uploadTime.add(Date.now() - start);

  if (!check(res, { "upload 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  filesUploaded.add(1);
  const body = parseBody<{ id?: string; fileId?: string }>(res);
  return body.id || body.fileId || null;
}

export function getFileMetadata(fileId: string): StorageFile | null {
  const res = http.get(`${baseUrl}/api/v1/storage/${fileId}`, { headers, tags: { endpoint: "storage" } });
  if (!check(res, { "metadata 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<StorageFile>(res);
}

export function downloadFile(fileId: string): boolean {
  const start = Date.now();
  const res = http.get(`${baseUrl}/api/v1/storage/${fileId}/download`, { headers, tags: { endpoint: "storage" } });
  downloadTime.add(Date.now() - start);

  if (!check(res, { "download 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return false;
  }
  filesDownloaded.add(1);
  return true;
}

export function deleteFile(fileId: string): boolean {
  const res = http.del(`${baseUrl}/api/v1/storage/${fileId}`, null, { headers, tags: { endpoint: "storage" } });
  if (!check(res, { "delete 2xx": (r) => r.status >= 200 && r.status < 300 })) {
    recordHttpError(res.status);
    return false;
  }
  return true;
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
    if (files.length > 0) getFileMetadata(files[Math.floor(Math.random() * files.length)].id);
  });
  sleep(0.5);
}

export default function () {
  storageOperationsCycle();
}
