import { describe, expect, test } from "bun:test";
import {
  buildConnectionMetadata,
  type MessageMetadata,
  resolveSource,
  resolveUserName,
} from "../../src/agent-manager";

describe("resolveSource", () => {
  test("returns platformName when provided", () => {
    expect(resolveSource({ platformName: "telegram" })).toBe("telegram");
  });

  test("returns 'agent-server' when platformName is undefined", () => {
    expect(resolveSource({ senderName: "Alice" })).toBe("agent-server");
  });

  test("returns 'agent-server' when metadata is undefined", () => {
    expect(resolveSource()).toBe("agent-server");
  });

  test("returns 'agent-server' when platformName is empty string", () => {
    expect(resolveSource({ platformName: "" })).toBe("agent-server");
  });
});

describe("resolveUserName", () => {
  test("returns senderName when provided", () => {
    expect(resolveUserName("user-001", { senderName: "Alice" })).toBe("Alice");
  });

  test("falls back to userId when senderName is undefined", () => {
    expect(resolveUserName("user-001", { platformName: "telegram" })).toBe("user-001");
  });

  test("falls back to userId when metadata is undefined", () => {
    expect(resolveUserName("user-001")).toBe("user-001");
  });

  test("falls back to userId when senderName is empty string", () => {
    expect(resolveUserName("user-001", { senderName: "" })).toBe("user-001");
  });
});

describe("buildConnectionMetadata", () => {
  test("returns chatId and platformName when both are provided", () => {
    const meta: MessageMetadata = {
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    };
    expect(buildConnectionMetadata(meta)).toEqual({
      chatId: "42",
      platformName: "telegram",
    });
  });

  test("returns only platformName when chatId is absent", () => {
    expect(buildConnectionMetadata({ platformName: "whatsapp" })).toEqual({
      platformName: "whatsapp",
    });
  });

  test("returns only chatId when platformName is absent", () => {
    expect(buildConnectionMetadata({ chatId: "42" })).toEqual({ chatId: "42" });
  });

  test("returns undefined when metadata is undefined", () => {
    expect(buildConnectionMetadata()).toBeUndefined();
  });

  test("returns undefined when metadata is empty", () => {
    expect(buildConnectionMetadata({})).toBeUndefined();
  });

  test("returns undefined when only senderName is provided", () => {
    expect(buildConnectionMetadata({ senderName: "Alice" })).toBeUndefined();
  });

  test("returns undefined when chatId and platformName are empty strings", () => {
    expect(buildConnectionMetadata({ chatId: "", platformName: "" })).toBeUndefined();
  });
});
