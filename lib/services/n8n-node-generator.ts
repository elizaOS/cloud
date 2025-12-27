/**
 * N8N Node Generator Service
 *
 * Converts discovered endpoints (A2A/MCP/REST) into n8n workflow nodes.
 */

import {
  endpointDiscoveryService,
  type EndpointNode,
} from "./endpoint-discovery";
import { logger } from "@/lib/utils/logger";

export interface N8NNodeDefinition {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  webhookId?: string;
  notes?: string;
  notesInFlow?: boolean;
  disabled?: boolean;
}

export interface NodeGenerationOptions {
  endpointId: string;
  position?: [number, number];
  credentials?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

class N8NNodeGeneratorService {
  /**
   * Generates an n8n node from an endpoint definition.
   */
  async generateNode(
    options: NodeGenerationOptions,
  ): Promise<N8NNodeDefinition> {
    const endpoint = await endpointDiscoveryService.getEndpointById(
      options.endpointId,
    );
    if (!endpoint) {
      throw new Error(`Endpoint ${options.endpointId} not found`);
    }

    const position = options.position || [250, 300];
    const nodeId = this.generateNodeId();

    switch (endpoint.type) {
      case "rest":
        return this.generateRESTNode(endpoint, nodeId, position, options);
      case "a2a":
        return this.generateA2ANode(endpoint, nodeId, position, options);
      case "mcp":
        return this.generateMCPNode(endpoint, nodeId, position, options);
      default:
        throw new Error(`Unsupported endpoint type: ${endpoint.type}`);
    }
  }

  /**
   * Generates an n8n HTTP Request node for REST endpoints.
   */
  private generateRESTNode(
    endpoint: EndpointNode,
    nodeId: string,
    position: [number, number],
    options: NodeGenerationOptions,
  ): N8NNodeDefinition {
    const method = endpoint.method || "GET";
    const url = endpoint.endpoint;

    // Handle path parameters
    let finalUrl = url;
    if (options.parameters) {
      for (const [key, value] of Object.entries(options.parameters)) {
        finalUrl = finalUrl.replace(`:${key}`, String(value));
      }
    }

    return {
      id: nodeId,
      name: endpoint.name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position,
      parameters: {
        method,
        url: finalUrl,
        authentication:
          endpoint.authentication?.type === "api_key"
            ? "genericCredentialType"
            : "none",
        options: {},
        ...options.parameters,
      },
      credentials:
        endpoint.authentication?.type === "api_key"
          ? {
              httpHeaderAuth: {
                id: "httpHeaderAuth",
                name: "API Key Auth",
              },
            }
          : undefined,
      notes: endpoint.description,
      notesInFlow: true,
    };
  }

  /**
   * Generates an n8n HTTP Request node for A2A endpoints.
   */
  private generateA2ANode(
    endpoint: EndpointNode,
    nodeId: string,
    position: [number, number],
    options: NodeGenerationOptions,
  ): N8NNodeDefinition {
    const skillId = endpoint.metadata?.skillId as string;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

    // Build JSON-RPC request body
    const requestBody = {
      jsonrpc: "2.0",
      method: "message/send",
      params: {
        message: {
          parts: [
            {
              type: "data",
              data: {
                skill: skillId,
                ...options.parameters,
              },
            },
          ],
        },
      },
      id: 1,
    };

    return {
      id: nodeId,
      name: endpoint.name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position,
      parameters: {
        method: "POST",
        url: `${baseUrl}/api/a2a`,
        authentication:
          endpoint.authentication?.type === "api_key"
            ? "genericCredentialType"
            : "none",
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: JSON.stringify(requestBody),
        options: {},
      },
      credentials:
        endpoint.authentication?.type === "api_key"
          ? {
              httpHeaderAuth: {
                id: "httpHeaderAuth",
                name: "API Key Auth",
              },
            }
          : undefined,
      notes: endpoint.description,
      notesInFlow: true,
    };
  }

  /**
   * Generates an n8n HTTP Request node for MCP endpoints.
   */
  private generateMCPNode(
    endpoint: EndpointNode,
    nodeId: string,
    position: [number, number],
    options: NodeGenerationOptions,
  ): N8NNodeDefinition {
    const toolName = endpoint.metadata?.toolName as string | undefined;

    if (!toolName) {
      // If no tool name, create a generic MCP node that can call tools/list first
      // This handles local MCPs where we haven't extracted tools yet
      return {
        id: nodeId,
        name: `${endpoint.name} (MCP)`,
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.1,
        position,
        parameters: {
          method: "POST",
          url: endpoint.endpoint,
          authentication:
            endpoint.authentication?.type === "api_key"
              ? "genericCredentialType"
              : "none",
          sendBody: true,
          contentType: "json",
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/list",
            id: 1,
          }),
          options: {},
        },
        credentials:
          endpoint.authentication?.type === "api_key"
            ? {
                httpHeaderAuth: {
                  id: "httpHeaderAuth",
                  name: "API Key Auth",
                },
              }
            : undefined,
        notes: `${endpoint.description}\n\nNote: This node calls tools/list. Use the result to create specific tool call nodes.`,
        notesInFlow: true,
      };
    }

    // Build JSON-RPC request body for tool call
    const requestBody = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: options.parameters || {},
      },
      id: 1,
    };

    return {
      id: nodeId,
      name: endpoint.name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position,
      parameters: {
        method: "POST",
        url: endpoint.endpoint,
        authentication:
          endpoint.authentication?.type === "api_key"
            ? "genericCredentialType"
            : "none",
        sendBody: true,
        contentType: "json",
        specifyBody: "json",
        jsonBody: JSON.stringify(requestBody),
        options: {},
      },
      credentials:
        endpoint.authentication?.type === "api_key"
          ? {
              httpHeaderAuth: {
                id: "httpHeaderAuth",
                name: "API Key Auth",
              },
            }
          : undefined,
      notes: endpoint.description,
      notesInFlow: true,
    };
  }

  /**
   * Generates multiple nodes from endpoint search results.
   */
  async generateNodesFromSearch(
    query: string,
    options?: {
      types?: ("a2a" | "mcp" | "rest")[];
      categories?: string[];
      limit?: number;
      startPosition?: [number, number];
      spacing?: [number, number];
    },
  ): Promise<N8NNodeDefinition[]> {
    const searchResults = await endpointDiscoveryService.searchEndpoints(
      query,
      {
        types: options?.types,
        categories: options?.categories,
        limit: options?.limit || 10,
      },
    );

    const nodes: N8NNodeDefinition[] = [];
    const startPos = options?.startPosition || [250, 300];
    const spacing = options?.spacing || [300, 200];

    for (let i = 0; i < searchResults.nodes.length; i++) {
      const endpoint = searchResults.nodes[i];
      const position: [number, number] = [
        startPos[0] + (i % 3) * spacing[0],
        startPos[1] + Math.floor(i / 3) * spacing[1],
      ];

      const node = await this.generateNode({
        endpointId: endpoint.id,
        position,
      });

      nodes.push(node);
    }

    return nodes;
  }

  /**
   * Generates a complete workflow with nodes from endpoints.
   */
  async generateWorkflowFromEndpoints(
    endpointIds: string[],
    workflowName: string,
  ): Promise<{
    name: string;
    nodes: N8NNodeDefinition[];
    connections: Record<string, unknown>;
  }> {
    const nodes: N8NNodeDefinition[] = [];
    const connections: Record<string, unknown> = {};

    // Add start node
    const startNode: N8NNodeDefinition = {
      id: this.generateNodeId(),
      name: "Start",
      type: "n8n-nodes-base.start",
      typeVersion: 1,
      position: [250, 300],
      parameters: {},
    };
    nodes.push(startNode);

    // Generate nodes for each endpoint
    let previousNodeId = startNode.id;
    for (let i = 0; i < endpointIds.length; i++) {
      const endpointId = endpointIds[i];
      const position: [number, number] = [250 + (i + 1) * 300, 300];

      const node = await this.generateNode({
        endpointId,
        position,
      });

      nodes.push(node);

      // Connect to previous node
      if (i === 0) {
        connections[startNode.id] = {
          main: [[{ node: node.id, type: "main", index: 0 }]],
        };
      } else {
        const prevNode = nodes[nodes.length - 2];
        connections[prevNode.id] = {
          main: [[{ node: node.id, type: "main", index: 0 }]],
        };
      }

      previousNodeId = node.id;
    }

    return {
      name: workflowName,
      nodes,
      connections,
    };
  }

  /**
   * Generates a unique node ID.
   */
  private generateNodeId(): string {
    return `node_${Math.random().toString(36).substring(2, 15)}`;
  }
}

export const n8nNodeGeneratorService = new N8NNodeGeneratorService();
