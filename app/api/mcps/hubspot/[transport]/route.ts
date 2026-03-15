/**
 * HubSpot MCP Server - Contacts, Companies, Deals, Owners
 *
 * Standalone MCP endpoint for HubSpot CRM tools with per-org OAuth.
 * Config: { "type": "streamable-http", "url": "/api/mcps/hubspot/streamable-http" }
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/utils/logger";
import { oauthService } from "@/lib/services/oauth";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { authContextStorage } from "@/app/api/mcp/lib/context";

export const maxDuration = 60;

interface McpHandlerResponse {
  status: number;
  headers?: Headers;
  text?: () => Promise<string>;
}

function isMcpHandlerResponse(resp: unknown): resp is McpHandlerResponse {
  return (
    typeof resp === "object" &&
    resp !== null &&
    typeof (resp as McpHandlerResponse).status === "number"
  );
}

// Lazy-loaded handler
let mcpHandler: ((req: Request) => Promise<Response>) | null = null;

async function getHubSpotMcpHandler() {
  if (mcpHandler) return mcpHandler;

  const { createMcpHandler } = await import("mcp-handler");
  const { z } = await import("zod3");

  async function getHubSpotToken(organizationId: string): Promise<string> {
    const result = await oauthService.getValidTokenByPlatform({
      organizationId,
      platform: "hubspot",
    });
    return result.accessToken;
  }

  async function hubspotFetch(
    orgId: string,
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await getHubSpotToken(orgId);
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok && response.status !== 204) {
      const error = await response.json().catch(() => {
        logger.warn("[HubSpot] Failed to parse error response", {
          status: response.status,
        });
        return {};
      });
      throw new Error(error.message || `HubSpot API error: ${response.status}`);
    }
    return response;
  }

  function getOrgId(): string {
    const ctx = authContextStorage.getStore();
    if (!ctx) throw new Error("Not authenticated");
    return ctx.user.organization_id;
  }

  function jsonResult(data: object) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  }

  function errorResult(msg: string) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ error: msg }) },
      ],
      isError: true,
    };
  }

  mcpHandler = createMcpHandler(
    (server) => {
      // ==================== CONNECTION STATUS ====================
      server.tool(
        "hubspot_status",
        "Check HubSpot OAuth connection status",
        {},
        async () => {
          try {
            const orgId = getOrgId();
            const connections = await oauthService.listConnections({
              organizationId: orgId,
              platform: "hubspot",
            });
            const active = connections.find((c) => c.status === "active");
            if (!active) {
              const expired = connections.find((c) => c.status === "expired");
              if (expired) {
                return jsonResult({
                  connected: false,
                  status: "expired",
                  message:
                    "HubSpot connection expired. Please reconnect in Settings > Connections.",
                });
              }
              return jsonResult({ connected: false });
            }
            return jsonResult({ connected: true, scopes: active.scopes });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      // ==================== CONTACTS ====================
      server.tool(
        "hubspot_list_contacts",
        "List contacts from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              limit: String(limit),
              properties: "firstname,lastname,email,phone,company",
            });
            if (after) params.set("after", after);
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/objects/contacts?${params}`
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              contacts: data.results || [],
              paging: data.paging,
              count: data.results?.length || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_get_contact",
        "Get a specific contact by ID",
        {
          contactId: z.string().describe("Contact ID"),
        },
        async ({ contactId }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,email,phone,company`
            );
            const contact = await res.json();
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_create_contact",
        "Create a new contact in HubSpot",
        {
          email: z.string().describe("Email address"),
          firstname: z.string().optional().describe("First name"),
          lastname: z.string().optional().describe("Last name"),
          phone: z.string().optional().describe("Phone number"),
          company: z.string().optional().describe("Company name"),
        },
        async ({ email, firstname, lastname, phone, company }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string> = { email };
            if (firstname) properties.firstname = firstname;
            if (lastname) properties.lastname = lastname;
            if (phone) properties.phone = phone;
            if (company) properties.company = company;
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/contacts",
              {
                method: "POST",
                body: JSON.stringify({ properties }),
              }
            );
            const contact = await res.json();
            logger.info("[HubSpotMCP] Contact created", {
              contactId: contact.id,
            });
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_update_contact",
        "Update an existing contact",
        {
          contactId: z.string().describe("Contact ID"),
          properties: z.record(z.string()).describe("Properties to update"),
        },
        async ({ contactId, properties }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
              {
                method: "PATCH",
                body: JSON.stringify({ properties }),
              }
            );
            const contact = await res.json();
            logger.info("[HubSpotMCP] Contact updated", { contactId });
            return jsonResult({ success: true, contact });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_search_contacts",
        "Search contacts",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/contacts/search",
              {
                method: "POST",
                body: JSON.stringify({
                  query,
                  limit,
                  properties: [
                    "firstname",
                    "lastname",
                    "email",
                    "phone",
                    "company",
                  ],
                }),
              }
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              contacts: data.results || [],
              paging: data.paging,
              count: data.total || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      // ==================== COMPANIES ====================
      server.tool(
        "hubspot_list_companies",
        "List companies from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              limit: String(limit),
              properties: "name,domain,industry,phone",
            });
            if (after) params.set("after", after);
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/objects/companies?${params}`
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              companies: data.results || [],
              paging: data.paging,
              count: data.results?.length || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_create_company",
        "Create a new company",
        {
          name: z.string().describe("Company name"),
          domain: z.string().optional().describe("Company website domain"),
          industry: z.string().optional().describe("Industry"),
          phone: z.string().optional().describe("Phone number"),
        },
        async ({ name, domain, industry, phone }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string> = { name };
            if (domain) properties.domain = domain;
            if (industry) properties.industry = industry;
            if (phone) properties.phone = phone;
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/companies",
              {
                method: "POST",
                body: JSON.stringify({ properties }),
              }
            );
            const company = await res.json();
            logger.info("[HubSpotMCP] Company created", {
              companyId: company.id,
            });
            return jsonResult({ success: true, company });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_search_companies",
        "Search companies",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/companies/search",
              {
                method: "POST",
                body: JSON.stringify({
                  query,
                  limit,
                  properties: ["name", "domain", "industry", "phone"],
                }),
              }
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              companies: data.results || [],
              paging: data.paging,
              count: data.total || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      // ==================== DEALS ====================
      server.tool(
        "hubspot_list_deals",
        "List deals from HubSpot CRM",
        {
          limit: z.number().int().min(1).max(100).optional().default(20),
          after: z.string().optional().describe("Pagination cursor"),
        },
        async ({ limit = 20, after }) => {
          try {
            const orgId = getOrgId();
            const params = new URLSearchParams({
              limit: String(limit),
              properties: "dealname,amount,dealstage,closedate",
            });
            if (after) params.set("after", after);
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/objects/deals?${params}`
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              deals: data.results || [],
              paging: data.paging,
              count: data.results?.length || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_create_deal",
        "Create a new deal",
        {
          dealname: z.string().describe("Deal name"),
          amount: z.number().optional().describe("Deal amount"),
          dealstage: z.string().optional().describe("Deal stage"),
          closedate: z
            .string()
            .optional()
            .describe("Expected close date (ISO 8601)"),
        },
        async ({ dealname, amount, dealstage, closedate }) => {
          try {
            const orgId = getOrgId();
            const properties: Record<string, string | number> = { dealname };
            if (amount !== undefined) properties.amount = amount;
            if (dealstage) properties.dealstage = dealstage;
            if (closedate) properties.closedate = closedate;
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/deals",
              {
                method: "POST",
                body: JSON.stringify({ properties }),
              }
            );
            const deal = await res.json();
            logger.info("[HubSpotMCP] Deal created", { dealId: deal.id });
            return jsonResult({ success: true, deal });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      server.tool(
        "hubspot_search_deals",
        "Search deals",
        {
          query: z.string().describe("Search query"),
          limit: z.number().int().min(1).max(100).optional().default(20),
        },
        async ({ query, limit = 20 }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              "https://api.hubapi.com/crm/v3/objects/deals/search",
              {
                method: "POST",
                body: JSON.stringify({
                  query,
                  limit,
                  properties: ["dealname", "amount", "dealstage", "closedate"],
                }),
              }
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              deals: data.results || [],
              paging: data.paging,
              count: data.total || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );

      // ==================== OWNERS ====================
      server.tool(
        "hubspot_list_owners",
        "List HubSpot owners (sales reps)",
        {
          limit: z.number().int().min(1).max(100).optional().default(100),
        },
        async ({ limit = 100 }) => {
          try {
            const orgId = getOrgId();
            const res = await hubspotFetch(
              orgId,
              `https://api.hubapi.com/crm/v3/owners?limit=${limit}`
            );
            const data = await res.json();
            return jsonResult({
              success: true,
              owners: data.results || [],
              count: data.results?.length || 0,
            });
          } catch (e) {
            return errorResult(e instanceof Error ? e.message : "Failed");
          }
        }
      );
    },
    { capabilities: { tools: {} } },
    { basePath: "/api/mcps/hubspot", maxDuration: 60 }
  );

  return mcpHandler;
}

async function handleRequest(req: NextRequest): Promise<Response> {
  try {
    const authResult = await requireAuthOrApiKeyWithOrg(req);
    const handler = await getHubSpotMcpHandler();
    const mcpResponse = await authContextStorage.run(authResult, () =>
      handler(req as Request)
    );

    if (!mcpResponse || !isMcpHandlerResponse(mcpResponse)) {
      return new Response(JSON.stringify({ error: "invalid_response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bodyText = mcpResponse.text ? await mcpResponse.text() : "";
    const headers: Record<string, string> = {};
    mcpResponse.headers?.forEach((v: string, k: string) => {
      headers[k] = v;
    });

    return new Response(bodyText, { status: mcpResponse.status, headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[HubSpotMCP] ${msg}`);
    const isAuth =
      msg.includes("API key") ||
      msg.includes("auth") ||
      msg.includes("Unauthorized") ||
      msg.includes("Not authenticated");
    return new Response(
      JSON.stringify({
        error: isAuth ? "authentication_required" : "internal_error",
        message: msg,
      }),
      {
        status: isAuth ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;
