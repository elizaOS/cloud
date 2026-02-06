# MCP Integration Plan: Linear, Notion, GitHub

## Overview

Add full CRUD MCP support for Linear, Notion, and GitHub following the existing Google OAuth/MCP pattern with dual exposure (platform MCP + standalone servers).

---

## Architecture Summary

### Pattern (from Google implementation)

1. **OAuth tokens** stored via `oauthService` in `platform_credentials`
2. **Standalone MCP servers** at `/api/mcps/{provider}/[transport]/route.ts`
3. **Platform MCP tools** at `/api/mcp/tools/{provider}.ts`
4. **Registry entries** conditionally shown based on OAuth connection status
5. **Auth context** propagated via `authContextStorage.run()`

---

## Files to Create

### 1. Standalone MCP Servers

```
app/api/mcps/linear/[transport]/route.ts
app/api/mcps/notion/[transport]/route.ts
app/api/mcps/github/[transport]/route.ts
```

### 2. Platform MCP Tools

```
app/api/mcp/tools/linear.ts
app/api/mcp/tools/notion.ts
app/api/mcp/tools/github.ts
```

---

## Files to Modify

```
app/api/mcp/tools/index.ts          # Export new register functions
app/api/mcp/route.ts                # Register new tools
app/api/mcp/registry/route.ts       # Add registry entries with OAuth gating
```

---

## Tool Definitions

### Linear (GraphQL - `https://api.linear.app/graphql`)

| Tool | Description | GraphQL Operation |
|------|-------------|-------------------|
| `linear_status` | Check OAuth connection | Query viewer |
| `linear_list_issues` | List/filter issues | Query issues |
| `linear_get_issue` | Get issue by ID | Query issue |
| `linear_create_issue` | Create issue | Mutation issueCreate |
| `linear_update_issue` | Update issue | Mutation issueUpdate |
| `linear_archive_issue` | Archive issue | Mutation issueArchive |
| `linear_delete_issue` | Delete issue | Mutation issueDelete |
| `linear_list_comments` | List issue comments | Query issue.comments |
| `linear_create_comment` | Create comment | Mutation commentCreate |
| `linear_update_comment` | Update comment | Mutation commentUpdate |
| `linear_delete_comment` | Delete comment | Mutation commentDelete |
| `linear_list_teams` | List teams | Query teams |
| `linear_get_team` | Get team details | Query team |
| `linear_list_projects` | List projects | Query projects |
| `linear_get_project` | Get project | Query project |
| `linear_create_project` | Create project | Mutation projectCreate |
| `linear_update_project` | Update project | Mutation projectUpdate |
| `linear_archive_project` | Archive project | Mutation projectArchive |
| `linear_list_labels` | List labels | Query issueLabels |
| `linear_create_label` | Create label | Mutation issueLabelCreate |
| `linear_list_users` | List workspace users | Query users |
| `linear_get_viewer` | Get current user | Query viewer |
| `linear_list_cycles` | List cycles/sprints | Query cycles |
| `linear_get_cycle` | Get cycle details | Query cycle |
| `linear_list_attachments` | List issue attachments | Query issue.attachments |
| `linear_create_attachment` | Create attachment | Mutation attachmentCreate |
| `linear_delete_attachment` | Delete attachment | Mutation attachmentDelete |

**OAuth Scopes**: `read,write`

---

### Notion (REST - `https://api.notion.com` - Version `2025-09-03`)

| Tool | Description | Endpoint |
|------|-------------|----------|
| `notion_status` | Check OAuth connection | GET /v1/users/me |
| `notion_search` | Search pages/data sources | POST /v1/search |
| `notion_get_page` | Get page | GET /v1/pages/{id} |
| `notion_create_page` | Create page | POST /v1/pages |
| `notion_update_page` | Update page properties | PATCH /v1/pages/{id} |
| `notion_archive_page` | Archive/restore page | PATCH /v1/pages/{id} |
| `notion_get_block` | Get block | GET /v1/blocks/{id} |
| `notion_get_block_children` | Get block children | GET /v1/blocks/{id}/children |
| `notion_append_blocks` | Append blocks | PATCH /v1/blocks/{id}/children |
| `notion_update_block` | Update block | PATCH /v1/blocks/{id} |
| `notion_delete_block` | Delete block | DELETE /v1/blocks/{id} |
| `notion_get_database` | Get database info | GET /v1/databases/{id} |
| `notion_create_database` | Create database | POST /v1/databases |
| `notion_update_database` | Update database | PATCH /v1/databases/{id} |
| `notion_get_data_source` | Get data source schema | GET /v1/data_sources/{id} |
| `notion_query_data_source` | Query data source | POST /v1/data_sources/{id}/query |
| `notion_update_data_source` | Update data source props | PATCH /v1/data_sources/{id}/properties |
| `notion_list_users` | List workspace users | GET /v1/users |
| `notion_get_user` | Get user | GET /v1/users/{id} |
| `notion_list_comments` | List comments | GET /v1/comments?block_id={id} |
| `notion_create_comment` | Create comment | POST /v1/comments |

**Required Headers**: `Authorization: Bearer {token}`, `Notion-Version: 2025-09-03`

**Rate Limit**: 3 req/sec

---

### GitHub (REST - `https://api.github.com`)

| Tool | Description | Endpoint |
|------|-------------|----------|
| `github_status` | Check OAuth connection | GET /user |
| `github_list_repos` | List user/org repos | GET /user/repos, GET /orgs/{org}/repos |
| `github_get_repo` | Get repository | GET /repos/{owner}/{repo} |
| `github_create_repo` | Create repository | POST /user/repos, POST /orgs/{org}/repos |
| `github_update_repo` | Update repository | PATCH /repos/{owner}/{repo} |
| `github_delete_repo` | Delete repository | DELETE /repos/{owner}/{repo} |
| `github_list_issues` | List issues | GET /repos/{owner}/{repo}/issues |
| `github_get_issue` | Get issue | GET /repos/{owner}/{repo}/issues/{n} |
| `github_create_issue` | Create issue | POST /repos/{owner}/{repo}/issues |
| `github_update_issue` | Update issue | PATCH /repos/{owner}/{repo}/issues/{n} |
| `github_close_issue` | Close issue | PATCH (state: closed) |
| `github_lock_issue` | Lock issue | PUT /repos/{owner}/{repo}/issues/{n}/lock |
| `github_list_issue_comments` | List comments | GET /repos/{owner}/{repo}/issues/{n}/comments |
| `github_create_issue_comment` | Create comment | POST /repos/{owner}/{repo}/issues/{n}/comments |
| `github_update_issue_comment` | Update comment | PATCH /repos/{owner}/{repo}/issues/comments/{id} |
| `github_delete_issue_comment` | Delete comment | DELETE /repos/{owner}/{repo}/issues/comments/{id} |
| `github_list_prs` | List pull requests | GET /repos/{owner}/{repo}/pulls |
| `github_get_pr` | Get pull request | GET /repos/{owner}/{repo}/pulls/{n} |
| `github_create_pr` | Create pull request | POST /repos/{owner}/{repo}/pulls |
| `github_update_pr` | Update pull request | PATCH /repos/{owner}/{repo}/pulls/{n} |
| `github_merge_pr` | Merge pull request | PUT /repos/{owner}/{repo}/pulls/{n}/merge |
| `github_list_pr_reviews` | List PR reviews | GET /repos/{owner}/{repo}/pulls/{n}/reviews |
| `github_create_pr_review` | Create PR review | POST /repos/{owner}/{repo}/pulls/{n}/reviews |
| `github_list_labels` | List labels | GET /repos/{owner}/{repo}/labels |
| `github_create_label` | Create label | POST /repos/{owner}/{repo}/labels |
| `github_update_label` | Update label | PATCH /repos/{owner}/{repo}/labels/{name} |
| `github_delete_label` | Delete label | DELETE /repos/{owner}/{repo}/labels/{name} |
| `github_list_milestones` | List milestones | GET /repos/{owner}/{repo}/milestones |
| `github_create_milestone` | Create milestone | POST /repos/{owner}/{repo}/milestones |
| `github_update_milestone` | Update milestone | PATCH /repos/{owner}/{repo}/milestones/{n} |
| `github_delete_milestone` | Delete milestone | DELETE /repos/{owner}/{repo}/milestones/{n} |
| `github_list_orgs` | List user orgs | GET /user/orgs |
| `github_get_org` | Get organization | GET /orgs/{org} |
| `github_list_org_members` | List org members | GET /orgs/{org}/members |
| `github_list_teams` | List teams | GET /orgs/{org}/teams |
| `github_get_team` | Get team | GET /orgs/{org}/teams/{slug} |
| `github_list_team_members` | List team members | GET /orgs/{org}/teams/{slug}/members |
| `github_list_branches` | List branches | GET /repos/{owner}/{repo}/branches |
| `github_get_branch` | Get branch | GET /repos/{owner}/{repo}/branches/{branch} |
| `github_delete_branch` | Delete branch | DELETE /repos/{owner}/{repo}/git/refs/heads/{branch} |
| `github_list_commits` | List commits | GET /repos/{owner}/{repo}/commits |
| `github_get_commit` | Get commit | GET /repos/{owner}/{repo}/commits/{ref} |
| `github_get_file` | Get file contents | GET /repos/{owner}/{repo}/contents/{path} |
| `github_create_file` | Create file | PUT /repos/{owner}/{repo}/contents/{path} |
| `github_update_file` | Update file | PUT /repos/{owner}/{repo}/contents/{path} (with sha) |
| `github_delete_file` | Delete file | DELETE /repos/{owner}/{repo}/contents/{path} |

**OAuth Scopes**: `repo`, `read:org`, `write:org`, `user`

**Required Headers**: `Authorization: Bearer {token}`, `X-GitHub-Api-Version: 2022-11-28`

**Rate Limit**: 5000 req/hr authenticated

---

## Registry Entry Structure

Each MCP needs a registry entry in `app/api/mcp/registry/route.ts`:

```typescript
{
  id: "linear",
  name: "Linear",
  description: "Issue tracking and project management",
  category: "productivity",
  endpoint: "/api/mcps/linear/streamable-http",
  type: "streamable-http",
  version: "1.0.0",
  status: "live",  // Conditionally set based on OAuth
  icon: "clipboard-list",
  color: "#5E6AD2",
  toolCount: 27,
  features: ["linear_list_issues", "linear_create_issue", ...],
  pricing: { type: "free", description: "Requires Linear OAuth connection" },
  x402Enabled: false,
  configTemplate: {
    servers: {
      linear: { type: "streamable-http", url: "/api/mcps/linear/streamable-http" }
    }
  }
}
```

### OAuth Gating Logic

```typescript
// In registry route, check OAuth connection status
const connections = await oauthService.listConnections({ organizationId: orgId });
const linearConnected = connections.some(c => c.platform === 'linear' && c.status === 'active');

// Filter registry entries
return registry.filter(entry => {
  if (entry.id === 'linear') return linearConnected;
  if (entry.id === 'notion') return notionConnected;
  if (entry.id === 'github') return githubConnected;
  return true;
});
```

---

## Implementation Order

### Phase 1: Linear MCP
1. Create `app/api/mcps/linear/[transport]/route.ts`
2. Create `app/api/mcp/tools/linear.ts`
3. Add registry entry
4. Test all tools

### Phase 2: Notion MCP
1. Create `app/api/mcps/notion/[transport]/route.ts`
2. Create `app/api/mcp/tools/notion.ts`
3. Add registry entry
4. Test all tools (especially data source migration)

### Phase 3: GitHub MCP
1. Create `app/api/mcps/github/[transport]/route.ts`
2. Create `app/api/mcp/tools/github.ts`
3. Add registry entry
4. Test all tools (including org-level)

### Phase 4: Integration
1. Update `app/api/mcp/tools/index.ts` exports
2. Update `app/api/mcp/route.ts` registrations
3. Update registry with OAuth gating
4. End-to-end testing

---

## Key Implementation Patterns

### Token Retrieval

```typescript
async function getLinearToken(organizationId: string): Promise<string> {
  const result = await oauthService.getValidTokenByPlatform({
    organizationId,
    platform: "linear"
  });
  return result.accessToken;
}
```

### GraphQL Request (Linear)

```typescript
async function linearGraphQL(orgId: string, query: string, variables?: Record<string, unknown>) {
  const token = await getLinearToken(orgId);
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}
```

### REST Request (Notion)

```typescript
async function notionFetch(orgId: string, endpoint: string, options: RequestInit = {}) {
  const token = await getNotionToken(orgId);
  const response = await fetch(`https://api.notion.com${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2025-09-03",
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Notion API error: ${response.status}`);
  }
  return response.json();
}
```

### REST Request (GitHub)

```typescript
async function githubFetch(orgId: string, endpoint: string, options: RequestInit = {}) {
  const token = await getGitHubToken(orgId);
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `GitHub API error: ${response.status}`);
  }
  return response.json();
}
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Notion API 2025-09-03 breaking changes | Use data_source endpoints for queries, test thoroughly |
| Linear GraphQL complexity limits | Keep queries minimal, paginate with `first: 50` |
| GitHub rate limiting (5000/hr) | Track X-RateLimit headers, implement backoff |
| Missing OAuth scopes | Graceful error: "Missing permission: {scope}" |
| Token refresh failures | Fall back to re-authentication prompt |

---

## Estimated Effort

| Phase | Files | Tools | Est. Time |
|-------|-------|-------|-----------|
| Linear | 2 new | 27 | 4-6 hours |
| Notion | 2 new | 21 | 4-6 hours |
| GitHub | 2 new | 45 | 6-8 hours |
| Integration | 3 modified | - | 2 hours |
| **Total** | **9** | **93** | **16-22 hours** |

---

## Questions Resolved

1. **Dual exposure**: Yes - both `/api/mcp` and `/api/mcps/{provider}`
2. **Registry visibility**: Hide until OAuth connected
3. **Notion API version**: 2025-09-03 (data sources)
4. **GitHub scope**: Full org access (`repo`, `read:org`, `write:org`, `user`)
5. **Tool depth**: Full CRUD as defined above
