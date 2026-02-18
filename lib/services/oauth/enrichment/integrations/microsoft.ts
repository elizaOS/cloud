/**
 * Microsoft Enrichment
 *
 * Fetches identity context from Microsoft Graph API.
 * Extracts: name, email, job title, department, company
 */

import { logger } from "@/lib/utils/logger";

interface MicrosoftUser {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  companyName?: string;
  officeLocation?: string;
}

export interface MicrosoftEnrichmentData {
  name: string | null;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  company: string | null;
  officeLocation: string | null;
}

export async function enrichMicrosoft(token: string): Promise<MicrosoftEnrichmentData> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[enrichMicrosoft] Graph API request failed", {
      status: response.status,
      error: errorText,
    });
    throw new Error(`Microsoft Graph API error: ${response.status}`);
  }

  const data: MicrosoftUser = await response.json();

  return {
    name: data.displayName ?? null,
    email: data.mail ?? data.userPrincipalName ?? null,
    jobTitle: data.jobTitle ?? null,
    department: data.department ?? null,
    company: data.companyName ?? null,
    officeLocation: data.officeLocation ?? null,
  };
}
