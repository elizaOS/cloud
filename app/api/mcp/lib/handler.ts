let mcpHandlerPromise: Promise<(req: Request) => Promise<unknown>> | null = null;

export async function getMcpHandler() {
  if (!mcpHandlerPromise) {
    mcpHandlerPromise = (async () => {
      const [{ createMcpHandler }, ...toolModules] = await Promise.all([
        import("mcp-handler"),
        import("../tools/credits"),
        import("../tools/api-keys"),
        import("../tools/generation"),
        import("../tools/memory"),
        import("../tools/conversations"),
        import("../tools/agents"),
        import("../tools/containers"),
        import("../tools/mcps"),
        import("../tools/rooms"),
        import("../tools/user"),
        import("../tools/knowledge"),
        import("../tools/redemption"),
        import("../tools/analytics"),
        import("../tools/google"),
        import("../tools/hubspot"),
        import("../tools/linear"),
        import("../tools/notion"),
        import("../tools/github"),
        import("../tools/asana"),
        import("../tools/dropbox"),
        import("../tools/salesforce"),
        import("../tools/airtable"),
        import("../tools/zoom"),
        import("../tools/jira"),
        import("../tools/linkedin"),
        import("../tools/twitter"),
      ]);

      const [
        credits,
        apiKeys,
        generation,
        memory,
        conversations,
        agents,
        containers,
        mcps,
        rooms,
        user,
        knowledge,
        redemption,
        analytics,
        google,
        hubspot,
        linear,
        notion,
        github,
        asana,
        dropbox,
        salesforce,
        airtable,
        zoom,
        jira,
        linkedin,
        twitter,
      ] = toolModules;

      return createMcpHandler(
        (server) => {
          credits.registerCreditTools(server);
          apiKeys.registerApiKeyTools(server);
          generation.registerGenerationTools(server);
          memory.registerMemoryTools(server);
          conversations.registerConversationTools(server);
          agents.registerAgentTools(server);
          containers.registerContainerTools(server);
          mcps.registerMcpTools(server);
          rooms.registerRoomTools(server);
          user.registerUserTools(server);
          knowledge.registerKnowledgeTools(server);
          redemption.registerRedemptionTools(server);
          analytics.registerAnalyticsTools(server);
          google.registerGoogleTools(server);
          hubspot.registerHubSpotTools(server);
          linear.registerLinearTools(server);
          notion.registerNotionTools(server);
          github.registerGitHubTools(server);
          asana.registerAsanaTools(server);
          dropbox.registerDropboxTools(server);
          salesforce.registerSalesforceTools(server);
          airtable.registerAirtableTools(server);
          zoom.registerZoomTools(server);
          jira.registerJiraTools(server);
          linkedin.registerLinkedInTools(server);
          twitter.registerTwitterTools(server);
        },
        {},
        { basePath: "/api" },
      );
    })();
  }

  return await mcpHandlerPromise;
}
