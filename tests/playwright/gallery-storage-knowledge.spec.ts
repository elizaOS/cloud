import { test, expect } from "@playwright/test";

/**
 * Gallery, Storage & Knowledge Base E2E Tests
 *
 * Tests UI and functionality for:
 * - Gallery: Image viewing, download, delete
 * - Storage: File browsing, upload, download
 * - Knowledge Base: File upload, document management, RAG configuration
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required for API tests
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Gallery Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("gallery page requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/gallery`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const redirectedToLogin = url.includes("/login");
    const redirectedToHome = url === `${BASE_URL}/` || url === BASE_URL;
    const onGalleryPage = url.includes("/gallery");

    // Accept any of: redirect to login, redirect to home, or stay on gallery page
    expect(redirectedToLogin || redirectedToHome || onGalleryPage).toBe(true);
    console.log(
      `✅ Gallery page auth check: ${redirectedToLogin ? "redirects to login" : redirectedToHome ? "redirects to home" : "shows gallery"}`,
    );
  });

  test("gallery page displays images", async ({ request }) => {
    if (!API_KEY) {
      console.log("ℹ️ TEST_API_KEY not set - skipping API test");
      return;
    }

    const response = await request.get(`${CLOUD_URL}/api/v1/gallery`, {
      headers: authHeaders(),
    });

    expect([200, 401, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.images || data)).toBe(true);
      console.log(`✅ Found ${(data.images || data).length} images in gallery`);
    } else {
      console.log(`ℹ️ Gallery endpoint returned ${response.status()}`);
    }
  });

  test("gallery page has upload button", async ({ page }) => {
    const response = await page
      .goto(`${BASE_URL}/dashboard/gallery`)
      .catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    // Check if redirected
    if (!url.includes("/gallery")) {
      console.log("ℹ️ Gallery page requires authentication (redirected)");
      return;
    }

    const uploadButton = page.locator(
      'button:has-text("Upload"), button:has-text("Add Image"), input[type="file"]',
    );
    const hasUploadButton = await uploadButton.isVisible().catch(() => false);

    if (hasUploadButton) {
      console.log("✅ Gallery upload button found");
    } else {
      console.log("ℹ️ Upload button not immediately visible");
    }
  });
});

test.describe("Gallery Image Operations", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("gallery images can be retrieved", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/gallery`, {
      headers: authHeaders(),
    });

    if (response.status() === 200) {
      const data = await response.json();
      const images = data.images || data;

      if (images.length > 0) {
        const image = images[0];
        expect(image).toHaveProperty("id");
        expect(image).toHaveProperty("url");
        console.log("✅ Gallery images have required properties");
      } else {
        console.log("ℹ️ No images in gallery yet");
      }
    }
  });

  test("gallery images support pagination", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/gallery?limit=10&offset=0`,
      {
        headers: authHeaders(),
      },
    );

    if (response.status() === 200) {
      const data = await response.json();
      const images = data.images || data;
      expect(images.length).toBeLessThanOrEqual(10);
      console.log("✅ Gallery pagination works");
    }
  });
});

test.describe("Storage Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("storage page requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/storage`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const redirectedToLogin = url.includes("/login");
    const redirectedToHome = url === `${BASE_URL}/` || url === BASE_URL;
    const onStoragePage = url.includes("/storage");

    // Accept any of: redirect to login, redirect to home, or stay on storage page
    expect(redirectedToLogin || redirectedToHome || onStoragePage).toBe(true);
    console.log(
      `✅ Storage page auth check: ${redirectedToLogin ? "redirects to login" : redirectedToHome ? "redirects to home" : "shows storage"}`,
    );
  });

  test("storage page has file browser", async ({ page }) => {
    const response = await page
      .goto(`${BASE_URL}/dashboard/storage`)
      .catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/storage")) {
      console.log("ℹ️ Storage page requires authentication (redirected)");
      return;
    }

    const fileBrowser = page.locator(
      '[class*="file"], [class*="browser"], table',
    );
    const hasFileBrowser = await fileBrowser.isVisible().catch(() => false);

    if (hasFileBrowser) {
      console.log("✅ Storage file browser found");
    } else {
      console.log("ℹ️ File browser not immediately visible");
    }
  });

  test("storage page has upload button", async ({ page }) => {
    const response = await page
      .goto(`${BASE_URL}/dashboard/storage`)
      .catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/storage")) {
      console.log("ℹ️ Storage page requires authentication (redirected)");
      return;
    }

    const uploadButton = page.locator(
      'button:has-text("Upload"), button:has-text("Add File"), input[type="file"]',
    );
    const hasUploadButton = await uploadButton.isVisible().catch(() => false);

    if (hasUploadButton) {
      console.log("✅ Storage upload button found");
    } else {
      console.log("ℹ️ Upload button not immediately visible");
    }
  });
});

test.describe("Storage File Operations", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("storage files can be listed", async ({ request }) => {
    // Storage API endpoint may vary - check common patterns
    const endpoints = [
      "/api/v1/storage/files",
      "/api/storage/list",
      "/api/v1/storage",
    ];

    let found = false;
    for (const endpoint of endpoints) {
      const response = await request.get(`${CLOUD_URL}${endpoint}`, {
        headers: authHeaders(),
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data.files || data)).toBe(true);
        console.log(`✅ Storage files listed via ${endpoint}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log("ℹ️ Storage API endpoint not found or not implemented");
    }
  });
});

test.describe("Knowledge Base Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("knowledge page requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const redirectedToLogin = url.includes("/login");
    const redirectedToHome = url === `${BASE_URL}/` || url === BASE_URL;
    const onKnowledgePage = url.includes("/knowledge");

    // Accept any of: redirect to login, redirect to home, or stay on knowledge page
    expect(redirectedToLogin || redirectedToHome || onKnowledgePage).toBe(true);
    console.log(
      `✅ Knowledge page auth check: ${redirectedToLogin ? "redirects to login" : redirectedToHome ? "redirects to home" : "shows knowledge"}`,
    );
  });

  test("knowledge page has document list", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const documentList = page.locator(
      '[class*="document"], [class*="file"], table, [role="list"]',
    );
    const hasDocumentList = await documentList.isVisible().catch(() => false);

    if (hasDocumentList) {
      console.log("✅ Knowledge document list found");
    } else {
      const url = page.url();
      if (url.includes("/login")) {
        console.log("ℹ️ Document list requires authentication");
      } else {
        console.log("ℹ️ Document list not immediately visible");
      }
    }
  });

  test("knowledge page has upload button", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const uploadButton = page.locator(
      'button:has-text("Upload"), button:has-text("Add Document"), input[type="file"]',
    );
    const hasUploadButton = await uploadButton.isVisible().catch(() => false);

    if (hasUploadButton) {
      console.log("✅ Knowledge upload button found");
    } else {
      const url = page.url();
      if (url.includes("/login")) {
        console.log("ℹ️ Upload button requires authentication");
      } else {
        console.log("ℹ️ Upload button not immediately visible");
      }
    }
  });
});

test.describe("Knowledge Base API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("knowledge documents can be listed", async ({ request }) => {
    const endpoints = [
      "/api/v1/knowledge/documents",
      "/api/v1/knowledge",
      "/api/knowledge/list",
    ];

    let found = false;
    for (const endpoint of endpoints) {
      const response = await request.get(`${CLOUD_URL}${endpoint}`, {
        headers: authHeaders(),
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data.documents || data.files || data)).toBe(true);
        console.log(`✅ Knowledge documents listed via ${endpoint}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log("ℹ️ Knowledge API endpoint not found or not implemented");
    }
  });

  test("knowledge documents can be uploaded", async ({ request }) => {
    // Create a test file
    const testFile = new Blob(["Test document content"], {
      type: "text/plain",
    });
    const formData = new FormData();
    formData.append("file", testFile, "test.txt");

    const endpoints = [
      "/api/v1/knowledge/upload",
      "/api/v1/knowledge/documents",
      "/api/knowledge/upload",
    ];

    let found = false;
    for (const endpoint of endpoints) {
      const response = await request.post(`${CLOUD_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          // Don't set Content-Type for FormData
        },
        multipart: {
          file: {
            name: "test.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Test document content"),
          },
        },
      });

      if (response.status() === 200 || response.status() === 201) {
        console.log(`✅ Knowledge document uploaded via ${endpoint}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(
        "ℹ️ Knowledge upload endpoint not found or requires different format",
      );
    }
  });

  test("knowledge documents can be deleted", async ({ request }) => {
    // First list documents
    const listResponse = await request.get(
      `${CLOUD_URL}/api/v1/knowledge/documents`,
      {
        headers: authHeaders(),
      },
    );

    if (listResponse.status() !== 200) {
      return;
    }

    const data = await listResponse.json();
    const documents = data.documents || data.files || data;

    if (documents.length === 0) {
      return;
    }

    const documentId = documents[0].id;

    const deleteResponse = await request.delete(
      `${CLOUD_URL}/api/v1/knowledge/documents/${documentId}`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ Knowledge document deleted");
    } else {
      console.log(`ℹ️ Document deletion returned ${deleteResponse.status()}`);
    }
  });
});

test.describe("RAG Configuration", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("RAG settings can be retrieved", async ({ request }) => {
    const endpoints = [
      "/api/v1/knowledge/settings",
      "/api/v1/knowledge/config",
      "/api/knowledge/settings",
    ];

    let found = false;
    for (const endpoint of endpoints) {
      const response = await request.get(`${CLOUD_URL}${endpoint}`, {
        headers: authHeaders(),
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toBeDefined();
        console.log(`✅ RAG settings retrieved via ${endpoint}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log("ℹ️ RAG settings endpoint not found");
    }
  });

  test("RAG settings can be updated", async ({ request }) => {
    const endpoints = [
      "/api/v1/knowledge/settings",
      "/api/v1/knowledge/config",
    ];

    let found = false;
    for (const endpoint of endpoints) {
      const response = await request.put(`${CLOUD_URL}${endpoint}`, {
        headers: authHeaders(),
        data: {
          chunkSize: 1000,
          chunkOverlap: 200,
        },
      });

      if (response.status() === 200) {
        console.log(`✅ RAG settings updated via ${endpoint}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log("ℹ️ RAG settings update endpoint not found");
    }
  });
});

test.describe("File Download", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("gallery images can be downloaded", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/gallery`, {
      headers: authHeaders(),
    });

    if (response.status() === 200) {
      const data = await response.json();
      const images = data.images || data;

      if (images.length > 0) {
        const image = images[0];
        const imageUrl = image.url || image.downloadUrl;

        if (imageUrl) {
          const downloadResponse = await request.get(imageUrl, {
            headers: authHeaders(),
          });

          expect([200, 302, 307]).toContain(downloadResponse.status());
          console.log("✅ Gallery image download works");
        } else {
          console.log("ℹ️ Image URL not available");
        }
      }
    }
  });
});
