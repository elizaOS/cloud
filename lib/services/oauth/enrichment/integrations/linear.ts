/**
 * Linear Enrichment
 *
 * Fetches identity context from Linear GraphQL API.
 * Extracts: viewer name/email, teams, active projects
 */

import { logger } from "@/lib/utils/logger";

interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface LinearProject {
  id: string;
  name: string;
}

interface LinearResponse {
  data?: {
    viewer?: {
      id?: string;
      name?: string;
      email?: string;
    };
    teams?: {
      nodes?: LinearTeam[];
    };
    projects?: {
      nodes?: LinearProject[];
    };
  };
  errors?: Array<{ message: string }>;
}

export interface LinearEnrichmentData {
  id: string | null;
  name: string | null;
  email: string | null;
  teams: string[];
  projects: string[];
}

const GRAPHQL_QUERY = `
  query {
    viewer {
      id
      name
      email
    }
    teams {
      nodes {
        id
        name
        key
      }
    }
    projects(filter: { state: { type: { in: ["started", "planned"] } } }) {
      nodes {
        id
        name
      }
    }
  }
`;

export async function enrichLinear(token: string): Promise<LinearEnrichmentData> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: GRAPHQL_QUERY }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[enrichLinear] GraphQL request failed", {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Linear GraphQL error: ${response.status}`);
  }

  const result: LinearResponse = await response.json();

  if (result.errors?.length) {
    logger.error("[enrichLinear] GraphQL errors", { errors: result.errors });
    throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
  }

  const { viewer, teams, projects } = result.data ?? {};

  return {
    id: viewer?.id ?? null,
    name: viewer?.name ?? null,
    email: viewer?.email ?? null,
    teams: teams?.nodes?.map((t) => t.name) ?? [],
    projects: projects?.nodes?.map((p) => p.name) ?? [],
  };
}
