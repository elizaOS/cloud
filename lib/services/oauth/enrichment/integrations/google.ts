/**
 * Google Enrichment
 *
 * Fetches identity context from Google People API.
 * Extracts: name, email, organization, job title
 *
 * Note: organizations field is often empty for consumer Gmail accounts.
 * Profile basics (name, email) come from stored profile_data.
 */

import { logger } from "@/lib/utils/logger";

interface GooglePerson {
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
}

export interface GoogleEnrichmentData {
  name: string | null;
  email: string | null;
  organization: string | null;
  jobTitle: string | null;
}

export async function enrichGoogle(token: string): Promise<GoogleEnrichmentData> {
  const response = await fetch(
    "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,organizations",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[enrichGoogle] People API request failed", {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Google People API error: ${response.status}`);
  }

  const data: GooglePerson = await response.json();

  return {
    name: data.names?.[0]?.displayName ?? null,
    email: data.emailAddresses?.[0]?.value ?? null,
    organization: data.organizations?.[0]?.name ?? null,
    jobTitle: data.organizations?.[0]?.title ?? null,
  };
}
