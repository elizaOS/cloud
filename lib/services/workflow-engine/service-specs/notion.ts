/**
 * Notion Service Specification
 *
 * Defines Notion API capabilities for the AI Workflow Factory.
 * Handles the key dependency: pages require databases.
 */

import type { ServiceSpecification } from "./types";

export const notionSpec: ServiceSpecification = {
  id: "notion",
  name: "Notion",
  description:
    "Notion workspace for creating pages, databases, and managing content",
  authentication: {
    type: "oauth2",
    scopes: [
      "read_content",
      "update_content",
      "insert_content",
      "read_user_info",
    ],
    requiredCredentials: ["access_token"],
    refreshable: false, // Notion tokens don't expire but can be revoked
  },
  baseUrl: "https://api.notion.com/v1",
  resources: {
    workspace: {
      search: {
        requires: ["access_token", "query"],
        outputs: ["results[]"],
        description: "Search the workspace for pages and databases",
        method: "POST",
        endpoint: "/search",
      },
      get_user: {
        requires: ["access_token"],
        outputs: ["user"],
        description: "Get current user info",
        method: "GET",
        endpoint: "/users/me",
      },
    },
    database: {
      list: {
        requires: ["access_token"],
        outputs: ["databases[]"],
        description: "List all databases the integration has access to",
        method: "POST",
        endpoint: "/search",
      },
      create: {
        requires: ["access_token", "parent_page_id", "title", "properties"],
        outputs: ["database_id"],
        description: "Create a new database",
        method: "POST",
        endpoint: "/databases",
      },
      query: {
        requires: ["access_token", "database_id"],
        outputs: ["pages[]"],
        description: "Query a database for pages",
        method: "POST",
        endpoint: "/databases/{database_id}/query",
      },
      get: {
        requires: ["access_token", "database_id"],
        outputs: ["database"],
        description: "Get database details",
        method: "GET",
        endpoint: "/databases/{database_id}",
      },
      update: {
        requires: ["access_token", "database_id", "properties"],
        outputs: ["database"],
        description: "Update database properties",
        method: "PATCH",
        endpoint: "/databases/{database_id}",
      },
    },
    page: {
      create: {
        requires: ["access_token", "parent_id", "properties"],
        outputs: ["page_id"],
        description: "Create a new page in a database or as child of page",
        method: "POST",
        endpoint: "/pages",
      },
      get: {
        requires: ["access_token", "page_id"],
        outputs: ["page"],
        description: "Get a page by ID",
        method: "GET",
        endpoint: "/pages/{page_id}",
      },
      update: {
        requires: ["access_token", "page_id", "properties"],
        outputs: ["page"],
        description: "Update page properties",
        method: "PATCH",
        endpoint: "/pages/{page_id}",
      },
      archive: {
        requires: ["access_token", "page_id"],
        outputs: ["page"],
        description: "Archive (soft delete) a page",
        method: "PATCH",
        endpoint: "/pages/{page_id}",
      },
    },
    block: {
      get_children: {
        requires: ["access_token", "block_id"],
        outputs: ["blocks[]"],
        description: "Get child blocks of a block or page",
        method: "GET",
        endpoint: "/blocks/{block_id}/children",
      },
      append_children: {
        requires: ["access_token", "block_id", "children"],
        outputs: ["blocks[]"],
        description: "Append blocks to a page or block",
        method: "PATCH",
        endpoint: "/blocks/{block_id}/children",
      },
      delete: {
        requires: ["access_token", "block_id"],
        description: "Delete a block",
        method: "DELETE",
        endpoint: "/blocks/{block_id}",
      },
    },
  },
  dependencies: [
    {
      operation: "page.create",
      dependsOn: ["database.exists_or_create"],
      resolution: "create",
    },
    {
      operation: "database.query",
      dependsOn: ["database.exists"],
      resolution: "fail",
    },
    {
      operation: "block.append_children",
      dependsOn: ["page.exists"],
      resolution: "fail",
    },
  ],
  examples: [
    {
      intent: "Create a Notion page with my notes",
      operations: ["database.list", "database.create", "page.create"],
      code: `
// First check if we have a suitable database
let database = await findDatabase('Notes');

// If no database exists, create one
if (!database) {
  database = await notion.databases.create({
    parent: { type: 'page_id', page_id: workspacePageId },
    title: [{ type: 'text', text: { content: 'Notes' } }],
    properties: {
      Name: { title: {} },
      Tags: { multi_select: {} },
      Created: { created_time: {} }
    }
  });
}

// Now create the page in the database
const page = await notion.pages.create({
  parent: { database_id: database.id },
  properties: {
    Name: { title: [{ text: { content: title } }] }
  },
  children: contentBlocks
});

return { pageId: page.id, url: page.url };
`,
    },
    {
      intent: "Add content to an existing Notion page",
      operations: ["workspace.search", "block.append_children"],
      code: `
// Find the page
const searchResults = await notion.search({
  query: pageName,
  filter: { property: 'object', value: 'page' }
});

const page = searchResults.results[0];
if (!page) throw new Error('Page not found');

// Append content blocks
await notion.blocks.children.append({
  block_id: page.id,
  children: contentBlocks
});

return { success: true, pageId: page.id };
`,
    },
    {
      intent: "Query a Notion database",
      operations: ["database.list", "database.query"],
      code: `
// Find the database
const database = await findDatabase(databaseName);
if (!database) throw new Error('Database not found');

// Query with filters
const results = await notion.databases.query({
  database_id: database.id,
  filter: filter,
  sorts: [{ property: 'Created', direction: 'descending' }]
});

return results.results;
`,
    },
  ],
};
