import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

// OAuth Protected Resource Metadata endpoint
// This endpoint provides OAuth configuration details for MCP clients
// See: https://datatracker.ietf.org/doc/html/rfc9728#name-protected-resource-metadata
const handler = protectedResourceHandler({
  // Authorization server URLs that can issue valid tokens
  // In our case, we use our own API key system
  authServerUrls: [
    process.env.NEXT_PUBLIC_APP_URL || "https://eliza-cloud.vercel.app",
  ],
});

// CORS handler for OPTIONS requests
const corsHandler = metadataCorsOptionsRequestHandler();

// This route cannot be statically exported (mobile builds)
export const dynamic = "force-dynamic";

export { handler as GET, corsHandler as OPTIONS };
