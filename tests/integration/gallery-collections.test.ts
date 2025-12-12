import { describe, test, expect } from "bun:test";

describe("Gallery Service", () => {
  test("generations service exports required methods", async () => {
    const { generationsService } = await import("@/lib/services/generations");
    expect(generationsService.getById).toBeDefined();
    expect(generationsService.listByOrganizationAndStatus).toBeDefined();
    expect(generationsService.create).toBeDefined();
  });

  test("media uploads service exports required methods", async () => {
    const { mediaUploadsService } = await import("@/lib/services/media-uploads");
    expect(mediaUploadsService.getById).toBeDefined();
    expect(mediaUploadsService.listByOrganization).toBeDefined();
    expect(mediaUploadsService.upload).toBeDefined();
  });
});

describe("Media Collections Service", () => {
  test("exports required methods", async () => {
    const { mediaCollectionsService } = await import("@/lib/services/media-collections");
    expect(mediaCollectionsService.getById).toBeDefined();
    expect(mediaCollectionsService.listByOrganization).toBeDefined();
    expect(mediaCollectionsService.create).toBeDefined();
    expect(mediaCollectionsService.addItems).toBeDefined();
    expect(mediaCollectionsService.removeItems).toBeDefined();
  });
});

describe("Gallery Actions", () => {
  test("exports required actions", async () => {
    const actions = await import("@/app/actions/gallery");
    expect(actions.listUserMedia).toBeDefined();
    expect(actions.deleteMedia).toBeDefined();
    expect(actions.uploadMedia).toBeDefined();
    expect(actions.listCollections).toBeDefined();
    expect(actions.createCollection).toBeDefined();
    expect(actions.addToCollection).toBeDefined();
  });
});

describe("Service Singletons", () => {
  test("services are singleton instances", async () => {
    const { generationsService: s1 } = await import("@/lib/services/generations");
    const { generationsService: s2 } = await import("@/lib/services/generations");
    expect(s1).toBe(s2);

    const { mediaCollectionsService: c1 } = await import("@/lib/services/media-collections");
    const { mediaCollectionsService: c2 } = await import("@/lib/services/media-collections");
    expect(c1).toBe(c2);
  });
});
