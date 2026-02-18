/**
 * Notion Enrichment
 *
 * Fetches identity context from Notion API.
 * Extracts: workspace name, user info, top pages
 */

import { logger } from "@/lib/utils/logger";

const NOTION_VERSION = "2022-06-28";

interface NotionUser {
  object: "user";
  id: string;
  type: "person" | "bot";
  name?: string;
  avatar_url?: string;
  person?: {
    email?: string;
  };
}

interface NotionBotOwner {
  type: "workspace" | "user";
  workspace?: boolean;
  user?: NotionUser;
}

interface NotionMeResponse {
  object: "user";
  id: string;
  type: "bot";
  name?: string;
  avatar_url?: string;
  bot?: {
    owner?: NotionBotOwner;
    workspace_name?: string;
  };
}

interface NotionPage {
  object: "page";
  id: string;
  properties?: {
    title?: {
      title?: Array<{ plain_text?: string }>;
    };
    Name?: {
      title?: Array<{ plain_text?: string }>;
    };
  };
}

interface NotionSearchResponse {
  object: "list";
  results: NotionPage[];
  has_more: boolean;
}

export interface NotionEnrichmentData {
  workspaceName: string | null;
  botName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  topPages: string[];
}

function extractPageTitle(page: NotionPage): string | null {
  const titleProp = page.properties?.title || page.properties?.Name;
  return titleProp?.title?.[0]?.plain_text ?? null;
}

export async function enrichNotion(token: string): Promise<NotionEnrichmentData> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };

  // Get bot/workspace info
  const meRes = await fetch("https://api.notion.com/v1/users/me", { headers });

  if (!meRes.ok) {
    const errorText = await meRes.text();
    logger.error("[enrichNotion] users/me request failed", {
      status: meRes.status,
      error: errorText,
    });
    throw new Error(`Notion users/me error: ${meRes.status}`);
  }

  const meData: NotionMeResponse = await meRes.json();

  const workspaceName = meData.bot?.workspace_name ?? null;
  const botName = meData.name ?? null;
  let ownerName: string | null = null;
  let ownerEmail: string | null = null;

  if (meData.bot?.owner?.type === "user" && meData.bot.owner.user) {
    ownerName = meData.bot.owner.user.name ?? null;
    ownerEmail = meData.bot.owner.user.person?.email ?? null;
  }

  // Search for top pages
  let topPages: string[] = [];

  const searchRes = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      page_size: 10,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
  });

  if (searchRes.ok) {
    const searchData: NotionSearchResponse = await searchRes.json();
    topPages = searchData.results
      .map(extractPageTitle)
      .filter((title): title is string => title !== null)
      .slice(0, 10);
  } else {
    logger.warn("[enrichNotion] search request failed", { status: searchRes.status });
  }

  return {
    workspaceName,
    botName,
    ownerName,
    ownerEmail,
    topPages,
  };
}
