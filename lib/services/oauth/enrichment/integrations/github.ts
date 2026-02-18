/**
 * GitHub Enrichment
 *
 * Fetches identity context from GitHub REST API.
 * Extracts: username, name, bio, company, orgs, top repos
 *
 * Uses 3 parallel API calls for efficiency.
 */

import { logger } from "@/lib/utils/logger";

interface GitHubUser {
  login: string;
  name: string | null;
  company: string | null;
  bio: string | null;
  avatar_url: string;
}

interface GitHubOrg {
  login: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  full_name: string;
}

export interface GitHubEnrichmentData {
  username: string;
  name: string | null;
  company: string | null;
  bio: string | null;
  organizations: string[];
  topRepositories: Array<{ name: string; description: string | null }>;
}

export async function enrichGitHub(token: string): Promise<GitHubEnrichmentData> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const [userRes, orgsRes, reposRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/orgs", { headers }),
    fetch("https://api.github.com/user/repos?sort=pushed&per_page=5", { headers }),
  ]);

  if (!userRes.ok) {
    const errorText = await userRes.text();
    logger.error("[enrichGitHub] User API request failed", {
      status: userRes.status,
      error: errorText,
    });
    throw new Error(`GitHub user API error: ${userRes.status}`);
  }

  const user: GitHubUser = await userRes.json();

  // Orgs and repos are best-effort - don't fail if they error
  let orgs: GitHubOrg[] = [];
  let repos: GitHubRepo[] = [];

  if (orgsRes.ok) {
    orgs = await orgsRes.json();
  } else {
    logger.warn("[enrichGitHub] Orgs API request failed", { status: orgsRes.status });
  }

  if (reposRes.ok) {
    repos = await reposRes.json();
  } else {
    logger.warn("[enrichGitHub] Repos API request failed", { status: reposRes.status });
  }

  return {
    username: user.login,
    name: user.name,
    company: user.company,
    bio: user.bio,
    organizations: orgs.map((o) => o.login),
    topRepositories: repos.map((r) => ({
      name: r.name,
      description: r.description,
    })),
  };
}
