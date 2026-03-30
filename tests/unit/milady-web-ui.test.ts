import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MiladySandbox } from "../../db/schemas/milady-sandboxes";
import {
  getMiladyAgentDirectWebUiUrl,
  getMiladyAgentPublicWebUiUrl,
  getPreferredMiladyAgentWebUiUrl,
} from "../../lib/milady-web-ui";

const savedAgentBaseDomain = process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;

function makeSandbox(
  overrides: Partial<MiladySandbox> = {},
): Pick<MiladySandbox, "id" | "headscale_ip" | "web_ui_port" | "bridge_port"> {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    headscale_ip: "100.64.0.5",
    web_ui_port: 20100,
    bridge_port: 18800,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN = "milady.shad0w.xyz";
});

afterEach(() => {
  if (savedAgentBaseDomain === undefined) {
    delete process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;
  } else {
    process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN = savedAgentBaseDomain;
  }
});

describe("getMiladyAgentPublicWebUiUrl", () => {
  test("uses configured canonical domain when available", () => {
    expect(getMiladyAgentPublicWebUiUrl(makeSandbox())).toBe(
      "https://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.milady.shad0w.xyz",
    );
  });

  test("normalizes configured domains with protocol and trailing path", () => {
    expect(
      getMiladyAgentPublicWebUiUrl(makeSandbox(), {
        baseDomain: "https://milady.shad0w.xyz/dashboard",
        path: "/chat",
      }),
    ).toBe("https://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.milady.shad0w.xyz/chat");
  });

  test("can fall back to the placeholder domain for compat callers", () => {
    delete process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;

    expect(
      getMiladyAgentPublicWebUiUrl(makeSandbox(), {
        allowExampleFallback: true,
      }),
    ).toBe("https://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.agents.example.com");
  });
});

describe("getPreferredMiladyAgentWebUiUrl", () => {
  test("prefers canonical public url over direct node access", () => {
    expect(getPreferredMiladyAgentWebUiUrl(makeSandbox())).toBe(
      "https://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.milady.shad0w.xyz",
    );
  });

  test("falls back to direct headscale url when no canonical domain is configured", () => {
    delete process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;

    expect(getPreferredMiladyAgentWebUiUrl(makeSandbox())).toBe("http://100.64.0.5:20100");
  });

  test("falls back to bridge port when web ui port is missing", () => {
    delete process.env.ELIZA_CLOUD_AGENT_BASE_DOMAIN;

    expect(getPreferredMiladyAgentWebUiUrl(makeSandbox({ web_ui_port: null }))).toBe(
      "http://100.64.0.5:18800",
    );
  });
});

describe("getMiladyAgentDirectWebUiUrl", () => {
  test("returns null when headscale access is unavailable", () => {
    expect(getMiladyAgentDirectWebUiUrl(makeSandbox({ headscale_ip: null }))).toBeNull();
  });
});
