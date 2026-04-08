import { describe, expect, test } from "bun:test";
import {
  attachAvailableContexts,
  filterActionsByRouting,
  getContextRoutingFromMessage,
  parseContextRoutingMetadata,
  setContextRoutingMetadata,
} from "@/lib/eliza/plugin-cloud-bootstrap/utils/context-routing";

describe("cloud bootstrap context routing", () => {
  test("parses routing metadata with context and evidence lists", () => {
    const parsed = parseContextRoutingMetadata({
      primaryContext: "wallet",
      secondaryContexts: "wallet, knowledge, wallet",
      evidenceTurnIds: "turn-1,turn-2,turn-1",
    });

    expect(parsed).toEqual({
      primaryContext: "wallet",
      secondaryContexts: ["wallet", "knowledge"],
      evidenceTurnIds: ["turn-1", "turn-2"],
    });
  });

  test("stores and retrieves routing metadata on the message content", () => {
    const message = {
      content: {
        text: "check my balance",
      },
    } as never;

    setContextRoutingMetadata(message, {
      primaryContext: "wallet",
      secondaryContexts: ["knowledge"],
      evidenceTurnIds: ["turn-9"],
    });

    expect(getContextRoutingFromMessage(message)).toEqual({
      primaryContext: "wallet",
      secondaryContexts: ["knowledge"],
      evidenceTurnIds: ["turn-9"],
    });
  });

  test("derives available contexts from action and provider catalog fallbacks", () => {
    const nextState = attachAvailableContexts(
      { values: {}, data: {}, text: "" } as never,
      {
        actions: [{ name: "SEND_TOKEN" }, { name: "WEB_SEARCH" }] as never,
        providers: [{ name: "walletBalance" }, { name: "knowledge" }] as never,
      },
    );

    expect(nextState.values.availableContexts).toContain("general");
    expect(nextState.values.availableContexts).toContain("wallet");
    expect(nextState.values.availableContexts).toContain("knowledge");
    expect(nextState.values.availableContexts).toContain("browser");
  });

  test("filters actions to the active routed contexts", () => {
    const filtered = filterActionsByRouting(
      [
        { name: "SEND_TOKEN" },
        { name: "WEB_SEARCH" },
        { name: "MANAGE_PLUGINS" },
      ] as never,
      {
        primaryContext: "wallet",
        secondaryContexts: ["knowledge"],
      },
    );

    expect(filtered.map((action) => action.name)).toEqual(["SEND_TOKEN", "WEB_SEARCH"]);
  });
});
