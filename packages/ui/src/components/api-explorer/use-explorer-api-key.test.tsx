import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils/toast-adapter", () => ({
  toast: vi.fn(),
}));

import { toast } from "@/lib/utils/toast-adapter";
import { useExplorerApiKey } from "./use-explorer-api-key";

const toastMock = vi.mocked(toast);

function HookProbe() {
  const { authToken, error, isLoading } = useExplorerApiKey();

  return (
    <div>
      <div data-testid="token">{authToken}</div>
      <div data-testid="error">{error ?? ""}</div>
      <div data-testid="loading">{String(isLoading)}</div>
    </div>
  );
}

describe("useExplorerApiKey", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastMock.mockReset();
  });

  it("fetches the explorer key on mount and hydrates the auth token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apiKey: {
          id: "key-1",
          name: "API Explorer Key",
          description: null,
          key_prefix: "eliza_123",
          key: "eliza_full_secret",
          created_at: "2026-04-09T00:00:00.000Z",
          is_active: true,
          usage_count: 0,
          last_used_at: null,
        },
        isNew: false,
      }),
    }) as typeof fetch;

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("eliza_full_secret");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("surfaces API errors and clears stale auth state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Please sign in to use the API Explorer",
      }),
    }) as typeof fetch;

    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Please sign in to use the API Explorer",
      );
    });
    expect(screen.getByTestId("token")).toHaveTextContent("");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
});
