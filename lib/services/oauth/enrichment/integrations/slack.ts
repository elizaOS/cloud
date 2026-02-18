/**
 * Slack Enrichment
 *
 * Fetches identity context from Slack Web API.
 * Extracts: workspace name, user real name, admin status
 *
 * Uses 3 sequential (chained) API calls:
 * 1. auth.test → get team_id and user_id
 * 2. team.info → get workspace name (requires team:read scope)
 * 3. users.info → get user details
 */

import { logger } from "@/lib/utils/logger";

interface SlackAuthTestResponse {
  ok: boolean;
  team_id?: string;
  user_id?: string;
  team?: string;
  user?: string;
  error?: string;
}

interface SlackTeamInfoResponse {
  ok: boolean;
  team?: {
    id: string;
    name: string;
    domain: string;
  };
  error?: string;
}

interface SlackUserInfoResponse {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    real_name: string;
    is_admin: boolean;
    is_owner: boolean;
    profile?: {
      real_name?: string;
      display_name?: string;
      email?: string;
    };
  };
  error?: string;
}

export interface SlackEnrichmentData {
  workspaceName: string | null;
  workspaceDomain: string | null;
  userId: string | null;
  username: string | null;
  realName: string | null;
  email: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}

export async function enrichSlack(token: string): Promise<SlackEnrichmentData> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Step 1: auth.test to get team_id and user_id
  const authRes = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers,
  });

  if (!authRes.ok) {
    throw new Error(`Slack auth.test HTTP error: ${authRes.status}`);
  }

  const authData: SlackAuthTestResponse = await authRes.json();

  if (!authData.ok) {
    logger.error("[enrichSlack] auth.test failed", { error: authData.error });
    throw new Error(`Slack auth.test error: ${authData.error}`);
  }

  const { team_id, user_id } = authData;

  // Step 2: team.info to get workspace name (requires team:read scope)
  let workspaceName: string | null = null;
  let workspaceDomain: string | null = null;

  if (team_id) {
    const teamRes = await fetch(`https://slack.com/api/team.info?team=${team_id}`, {
      headers,
    });

    if (teamRes.ok) {
      const teamData: SlackTeamInfoResponse = await teamRes.json();
      if (teamData.ok && teamData.team) {
        workspaceName = teamData.team.name;
        workspaceDomain = teamData.team.domain;
      } else if (!teamData.ok) {
        // team:read scope may not be granted - this is expected in some cases
        logger.warn("[enrichSlack] team.info failed (may need team:read scope)", {
          error: teamData.error,
        });
      }
    }
  }

  // Step 3: users.info to get user details
  let username: string | null = null;
  let realName: string | null = null;
  let email: string | null = null;
  let isAdmin = false;
  let isOwner = false;

  if (user_id) {
    const userRes = await fetch(`https://slack.com/api/users.info?user=${user_id}`, {
      headers,
    });

    if (userRes.ok) {
      const userData: SlackUserInfoResponse = await userRes.json();
      if (userData.ok && userData.user) {
        username = userData.user.name;
        realName = userData.user.real_name || userData.user.profile?.real_name || null;
        email = userData.user.profile?.email || null;
        isAdmin = userData.user.is_admin;
        isOwner = userData.user.is_owner;
      } else if (!userData.ok) {
        logger.warn("[enrichSlack] users.info failed", { error: userData.error });
      }
    }
  }

  return {
    workspaceName,
    workspaceDomain,
    userId: user_id ?? null,
    username,
    realName,
    email,
    isAdmin,
    isOwner,
  };
}
