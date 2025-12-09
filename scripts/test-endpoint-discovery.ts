import { endpointDiscoveryService } from "../lib/services/endpoint-discovery";

async function test() {
  console.log("Testing endpoint discovery...\n");
  
  try {
    const endpoints = await endpointDiscoveryService.discoverAllEndpoints();
    
    const rest = endpoints.filter(e => e.type === "rest");
    const a2a = endpoints.filter(e => e.type === "a2a");
    const mcp = endpoints.filter(e => e.type === "mcp");
    
    console.log(`Total endpoints: ${endpoints.length}`);
    console.log(`  REST: ${rest.length}`);
    console.log(`  A2A: ${a2a.length}`);
    console.log(`  MCP: ${mcp.length}\n`);
    
    if (rest.length > 0) {
      console.log("Sample REST endpoints:");
      rest.slice(0, 10).forEach(e => {
        console.log(`  - ${e.name} (${e.method}) ${e.endpoint}`);
      });
    } else {
      console.log("⚠️  No REST endpoints discovered!");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

test();


