import { logger } from "@/lib/utils/logger";
import { Octokit } from "@octokit/rest";

/**
 * GitHub Repository Service
 *
 * Manages app repositories in a private GitHub organization.
 * Each app = one private repo, enabling:
 * - Version control via git commits
 * - Easy restore by cloning
 * - No need for custom snapshot storage
 */

const GITHUB_ORG = process.env.GITHUB_ORG_NAME || "elizacloud-apps";
const TEMPLATE_REPO = process.env.GITHUB_TEMPLATE_REPO || "elizacloud-apps/sandbox-template";

// Singleton Octokit instance
let octokitInstance: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokitInstance) {
    const token = process.env.GITHUB_APP_TOKEN || process.env.GIT_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "GitHub token not configured. Set GITHUB_APP_TOKEN or GIT_ACCESS_TOKEN environment variable."
      );
    }
    octokitInstance = new Octokit({ auth: token });
  }
  return octokitInstance;
}

export interface CreateRepoOptions {
  /** Unique name for the repo (e.g., app-{appId}) */
  name: string;
  /** Description for the repo */
  description?: string;
  /** Whether to make it private (default: true) */
  isPrivate?: boolean;
}

export interface RepoInfo {
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  createdAt: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

/**
 * Create a new repository from the template
 */
export async function createAppRepo(options: CreateRepoOptions): Promise<RepoInfo> {
  const octokit = getOctokit();
  const { name, description, isPrivate = true } = options;

  logger.info("Creating app repository from template", {
    name,
    template: TEMPLATE_REPO,
    org: GITHUB_ORG,
  });

  try {
    // Create repo from template
    const [templateOwner, templateRepoName] = TEMPLATE_REPO.split("/");
    
    const response = await octokit.repos.createUsingTemplate({
      template_owner: templateOwner,
      template_repo: templateRepoName,
      owner: GITHUB_ORG,
      name,
      description: description || `ElizaCloud App: ${name}`,
      private: isPrivate,
      include_all_branches: false,
    });

    const repo = response.data;

    logger.info("App repository created", {
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
    });

    return {
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
      createdAt: repo.created_at,
    };
  } catch (error) {
    logger.error("Failed to create app repository", { name, error });
    throw error;
  }
}

/**
 * Get repository info
 */
export async function getRepoInfo(repoName: string): Promise<RepoInfo | null> {
  const octokit = getOctokit();

  try {
    const response = await octokit.repos.get({
      owner: GITHUB_ORG,
      repo: repoName,
    });

    const repo = response.data;
    return {
      name: repo.name,
      fullName: repo.full_name,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
      createdAt: repo.created_at,
    };
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a repository
 */
export async function deleteAppRepo(repoName: string): Promise<void> {
  const octokit = getOctokit();

  logger.info("Deleting app repository", { repoName, org: GITHUB_ORG });

  try {
    await octokit.repos.delete({
      owner: GITHUB_ORG,
      repo: repoName,
    });

    logger.info("App repository deleted", { repoName });
  } catch (error) {
    logger.error("Failed to delete app repository", { repoName, error });
    throw error;
  }
}

/**
 * List commits for a repository
 */
export async function listCommits(
  repoName: string,
  options?: { branch?: string; limit?: number }
): Promise<CommitInfo[]> {
  const octokit = getOctokit();
  const { branch, limit = 20 } = options || {};

  try {
    const response = await octokit.repos.listCommits({
      owner: GITHUB_ORG,
      repo: repoName,
      sha: branch,
      per_page: limit,
    });

    return response.data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || "Unknown",
      date: commit.commit.author?.date || "",
      url: commit.html_url,
    }));
  } catch (error) {
    logger.error("Failed to list commits", { repoName, error });
    throw error;
  }
}

/**
 * Get the authenticated clone URL with token embedded
 * Used for cloning private repos in sandboxes
 */
export function getAuthenticatedCloneUrl(repoName: string): string {
  const token = process.env.GITHUB_APP_TOKEN || process.env.GIT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GitHub token not configured");
  }
  return `https://x-access-token:${token}@github.com/${GITHUB_ORG}/${repoName}.git`;
}

/**
 * Get git credentials for sandbox commands
 */
export function getGitCredentials(): { username: string; password: string } {
  const token = process.env.GITHUB_APP_TOKEN || process.env.GIT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GitHub token not configured");
  }
  return {
    username: "x-access-token",
    password: token,
  };
}

/**
 * Generate a unique repo name for an app
 */
export function generateRepoName(appId: string, appSlug?: string): string {
  // Use slug if available for readability, otherwise use app ID
  const base = appSlug || appId;
  // Ensure valid GitHub repo name (lowercase, alphanumeric, hyphens)
  return `app-${base.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50)}`;
}

/**
 * Check if the GitHub service is properly configured
 */
export async function checkGitHubConfig(): Promise<{
  configured: boolean;
  org: string;
  template: string;
  error?: string;
}> {
  try {
    const octokit = getOctokit();
    
    // Try to get org info
    await octokit.orgs.get({ org: GITHUB_ORG });
    
    // Try to get template repo
    const [templateOwner, templateRepoName] = TEMPLATE_REPO.split("/");
    await octokit.repos.get({ owner: templateOwner, repo: templateRepoName });
    
    return {
      configured: true,
      org: GITHUB_ORG,
      template: TEMPLATE_REPO,
    };
  } catch (error) {
    return {
      configured: false,
      org: GITHUB_ORG,
      template: TEMPLATE_REPO,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export const githubReposService = {
  createAppRepo,
  getRepoInfo,
  deleteAppRepo,
  listCommits,
  getAuthenticatedCloneUrl,
  getGitCredentials,
  generateRepoName,
  checkGitHubConfig,
};
