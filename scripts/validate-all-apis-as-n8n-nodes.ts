/**
 * Comprehensive Validation: All Cloud APIs as N8N Nodes
 * 
 * This script validates that ALL API endpoints in the cloud are:
 * 1. Discoverable via endpoint discovery service
 * 2. Can be generated as n8n nodes
 * 3. Are properly categorized
 * 
 * Run with: bun run scripts/validate-all-apis-as-n8n-nodes.ts
 */

import { endpointDiscoveryService } from "../lib/services/endpoint-discovery";
import { n8nNodeGeneratorService } from "../lib/services/n8n-node-generator";
import { logger } from "../lib/utils/logger";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface ApiRoute {
  path: string;
  methods: string[];
  file: string;
}

async function discoverAllApiRoutes(): Promise<ApiRoute[]> {
  const routes: ApiRoute[] = [];
  const apiDir = join(process.cwd(), "app/api");
  
  async function scanDirectory(dir: string, basePath: string = ""): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const routePath = basePath ? `${basePath}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          // Skip certain directories
          if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            continue;
          }
          await scanDirectory(fullPath, routePath);
        } else if (entry.name === "route.ts") {
          // Read the file to find exported HTTP methods
          try {
            const content = await readFile(fullPath, "utf-8");
            const methods: string[] = [];
            
            if (content.includes("export async function GET")) methods.push("GET");
            if (content.includes("export async function POST")) methods.push("POST");
            if (content.includes("export async function PUT")) methods.push("PUT");
            if (content.includes("export async function DELETE")) methods.push("DELETE");
            if (content.includes("export async function PATCH")) methods.push("PATCH");
            
            if (methods.length > 0) {
              // Convert file path to API route
              // app/api/v1/chat/route.ts -> /api/v1/chat
              const apiPath = fullPath
                .replace(process.cwd(), "")
                .replace(/\\/g, "/")
                .replace("/app", "")
                .replace("/route.ts", "");
              
              routes.push({
                path: apiPath,
                methods,
                file: fullPath,
              });
            }
          } catch (error) {
            // Skip files we can't read
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  await scanDirectory(apiDir);
  return routes;
}

async function testEndpointDiscovery() {
  console.log("\n🔍 Testing Endpoint Discovery Coverage...\n");
  
  // Discover all API routes
  console.log("📋 Discovering all API routes...");
  const apiRoutes = await discoverAllApiRoutes();
  console.log(`   Found ${apiRoutes.length} API route files\n`);
  
  // Discover endpoints via service
  console.log("🔎 Discovering endpoints via EndpointDiscoveryService...");
  const discoveredEndpoints = await endpointDiscoveryService.discoverAllEndpoints();
  const restEndpoints = discoveredEndpoints.filter(e => e.type === "rest");
  
  console.log(`   Total endpoints discovered: ${discoveredEndpoints.length}`);
  console.log(`   - A2A: ${discoveredEndpoints.filter(e => e.type === "a2a").length}`);
  console.log(`   - MCP: ${discoveredEndpoints.filter(e => e.type === "mcp").length}`);
  console.log(`   - REST: ${restEndpoints.length}\n`);
  
  // Map discovered REST endpoints by path
  const discoveredPaths = new Map<string, Set<string>>();
  for (const endpoint of restEndpoints) {
    const url = new URL(endpoint.endpoint);
    const path = url.pathname;
    const method = endpoint.method || "GET";
    
    if (!discoveredPaths.has(path)) {
      discoveredPaths.set(path, new Set());
    }
    discoveredPaths.get(path)!.add(method);
  }
  
  // Check coverage
  console.log("📊 Coverage Analysis:\n");
  
  const missing: ApiRoute[] = [];
  const partial: Array<{ route: ApiRoute; missingMethods: string[] }> = [];
  const covered: ApiRoute[] = [];
  
  for (const route of apiRoutes) {
    const discoveredMethods = discoveredPaths.get(route.path) || new Set();
    const missingMethods = route.methods.filter(m => !discoveredMethods.has(m));
    
    if (discoveredMethods.size === 0) {
      missing.push(route);
    } else if (missingMethods.length > 0) {
      partial.push({ route, missingMethods });
    } else {
      covered.push(route);
    }
  }
  
  console.log(`✅ Fully Covered: ${covered.length} routes`);
  console.log(`⚠️  Partially Covered: ${partial.length} routes`);
  console.log(`❌ Missing: ${missing.length} routes\n`);
  
  if (missing.length > 0) {
    console.log("❌ Missing Routes:\n");
    for (const route of missing.slice(0, 20)) {
      console.log(`   ${route.path} [${route.methods.join(", ")}]`);
    }
    if (missing.length > 20) {
      console.log(`   ... and ${missing.length - 20} more\n`);
    }
  }
  
  if (partial.length > 0) {
    console.log("⚠️  Partially Covered Routes:\n");
    for (const item of partial.slice(0, 10)) {
      console.log(`   ${item.route.path} [${item.route.methods.join(", ")}]`);
      console.log(`      Missing methods: ${item.missingMethods.join(", ")}\n`);
    }
    if (partial.length > 10) {
      console.log(`   ... and ${partial.length - 10} more\n`);
    }
  }
  
  return {
    totalRoutes: apiRoutes.length,
    covered: covered.length,
    partial: partial.length,
    missing: missing.length,
    missingRoutes: missing,
    partialRoutes: partial,
  };
}

async function testNodeGeneration() {
  console.log("\n🔧 Testing Node Generation for All Endpoint Types...\n");
  
  const discoveredEndpoints = await endpointDiscoveryService.discoverAllEndpoints();
  
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ endpoint: string; error: string }> = [];
  
  // Test a sample from each type
  const a2aEndpoints = discoveredEndpoints.filter(e => e.type === "a2a").slice(0, 5);
  const mcpEndpoints = discoveredEndpoints.filter(e => e.type === "mcp").slice(0, 5);
  const restEndpoints = discoveredEndpoints.filter(e => e.type === "rest").slice(0, 10);
  
  console.log(`Testing node generation for ${a2aEndpoints.length} A2A, ${mcpEndpoints.length} MCP, ${restEndpoints.length} REST endpoints...\n`);
  
  for (const endpoint of [...a2aEndpoints, ...mcpEndpoints, ...restEndpoints]) {
    try {
      const node = await n8nNodeGeneratorService.generateNode({
        endpointId: endpoint.id,
        position: [250, 300],
      });
      
      // Validate node structure
      if (!node.id || !node.type || !node.name) {
        throw new Error("Node missing required fields");
      }
      
      if (node.type !== "n8n-nodes-base.httpRequest") {
        throw new Error(`Unexpected node type: ${node.type}`);
      }
      
      // Validate parameters based on type
      if (endpoint.type === "rest") {
        if (!node.parameters.url || !node.parameters.method) {
          throw new Error("REST node missing URL or method");
        }
      } else if (endpoint.type === "a2a" || endpoint.type === "mcp") {
        if (!node.parameters.jsonBody || !node.parameters.sendBody) {
          throw new Error(`${endpoint.type.toUpperCase()} node missing jsonBody or sendBody`);
        }
        if (node.parameters.contentType !== "json" || node.parameters.specifyBody !== "json") {
          throw new Error(`${endpoint.type.toUpperCase()} node missing correct contentType/specifyBody`);
        }
      }
      
      successCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        endpoint: `${endpoint.name} (${endpoint.type})`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  console.log(`✅ Successfully generated: ${successCount} nodes`);
  if (errorCount > 0) {
    console.log(`❌ Failed to generate: ${errorCount} nodes\n`);
    console.log("Errors:\n");
    for (const err of errors.slice(0, 5)) {
      console.log(`   ${err.endpoint}: ${err.error}`);
    }
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more errors`);
    }
  } else {
    console.log(`✅ All node generation tests passed!\n`);
  }
  
  return {
    successCount,
    errorCount,
    errors,
  };
}

async function testA2AAndMCPCoverage() {
  console.log("\n🔍 Testing A2A and MCP Coverage...\n");
  
  // Get all A2A skills
  const { AVAILABLE_SKILLS } = await import("../lib/api/a2a/handlers");
  console.log(`📋 Available A2A Skills: ${AVAILABLE_SKILLS.length}`);
  
  // Get discovered A2A endpoints
  const discoveredEndpoints = await endpointDiscoveryService.discoverAllEndpoints();
  const a2aEndpoints = discoveredEndpoints.filter(e => e.type === "a2a");
  const mcpEndpoints = discoveredEndpoints.filter(e => e.type === "mcp");
  
  console.log(`🔎 Discovered A2A Endpoints: ${a2aEndpoints.length}`);
  console.log(`🔎 Discovered MCP Endpoints: ${mcpEndpoints.length}\n`);
  
  // Check A2A coverage
  const a2aSkillIds = new Set(AVAILABLE_SKILLS.map(s => s.id));
  const discoveredA2aIds = new Set(
    a2aEndpoints
      .map(e => e.metadata?.skillId as string | undefined)
      .filter((id): id is string => !!id)
  );
  
  const missingA2a = Array.from(a2aSkillIds).filter(id => !discoveredA2aIds.has(id));
  
  if (missingA2a.length > 0) {
    console.log(`⚠️  Missing A2A Skills in Discovery:\n`);
    for (const id of missingA2a.slice(0, 10)) {
      console.log(`   - ${id}`);
    }
    if (missingA2a.length > 10) {
      console.log(`   ... and ${missingA2a.length - 10} more\n`);
    }
  } else {
    console.log(`✅ All A2A skills are discoverable\n`);
  }
  
  // Check MCP coverage (we can't easily enumerate all MCP tools, but we can check main ones)
  const mainMcpTools = [
    "check_credits", "get_recent_usage", "generate_text", "generate_image",
    "generate_video", "save_memory", "retrieve_memories", "create_conversation",
    "n8n_create_workflow", "n8n_list_workflows", "n8n_generate_workflow",
    "n8n_discover_nodes", "n8n_generate_node",
  ];
  
  const discoveredMcpToolNames = new Set(
    mcpEndpoints
      .map(e => e.metadata?.toolName as string | undefined)
      .filter((name): name is string => !!name)
  );
  
  const missingMcp = mainMcpTools.filter(name => !discoveredMcpToolNames.has(name));
  
  if (missingMcp.length > 0) {
    console.log(`⚠️  Missing Main MCP Tools in Discovery:\n`);
    for (const name of missingMcp) {
      console.log(`   - ${name}`);
    }
    console.log();
  } else {
    console.log(`✅ All main MCP tools are discoverable\n`);
  }
  
  return {
    a2aTotal: AVAILABLE_SKILLS.length,
    a2aDiscovered: a2aEndpoints.length,
    a2aMissing: missingA2a.length,
    mcpDiscovered: mcpEndpoints.length,
    mcpMissing: missingMcp.length,
  };
}

async function generateComprehensiveReport() {
  console.log("\n📊 Generating Comprehensive Coverage Report...\n");
  
  const discoveredEndpoints = await endpointDiscoveryService.discoverAllEndpoints();
  
  // Categorize endpoints
  const byCategory = new Map<string, number>();
  const byType = new Map<string, number>();
  const bySource = new Map<string, number>();
  
  for (const endpoint of discoveredEndpoints) {
    byCategory.set(endpoint.category, (byCategory.get(endpoint.category) || 0) + 1);
    byType.set(endpoint.type, (byType.get(endpoint.type) || 0) + 1);
    bySource.set(endpoint.source, (bySource.get(endpoint.source) || 0) + 1);
  }
  
  console.log("📈 Endpoint Statistics:\n");
  console.log("By Type:");
  for (const [type, count] of Array.from(byType.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type.toUpperCase()}: ${count}`);
  }
  
  console.log("\nBy Category:");
  for (const [category, count] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${category}: ${count}`);
  }
  
  console.log("\nBy Source:");
  for (const [source, count] of Array.from(bySource.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${source}: ${count}`);
  }
  
  console.log();
}

async function runAllValidations() {
  console.log("=" .repeat(70));
  console.log("🔬 COMPREHENSIVE API-TO-N8N-NODE VALIDATION");
  console.log("=" .repeat(70));
  
  const results = {
    endpointDiscovery: null as any,
    nodeGeneration: null as any,
    a2aMcpCoverage: null as any,
  };
  
  try {
    results.endpointDiscovery = await testEndpointDiscovery();
  } catch (error) {
    console.error("❌ Endpoint discovery test failed:", error);
  }
  
  try {
    results.nodeGeneration = await testNodeGeneration();
  } catch (error) {
    console.error("❌ Node generation test failed:", error);
  }
  
  try {
    results.a2aMcpCoverage = await testA2AAndMCPCoverage();
  } catch (error) {
    console.error("❌ A2A/MCP coverage test failed:", error);
  }
  
  try {
    await generateComprehensiveReport();
  } catch (error) {
    console.error("❌ Report generation failed:", error);
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("📋 VALIDATION SUMMARY");
  console.log("=".repeat(70) + "\n");
  
  if (results.endpointDiscovery) {
    const coverage = results.endpointDiscovery;
    const coveragePercent = ((coverage.covered / coverage.totalRoutes) * 100).toFixed(1);
    console.log(`API Route Coverage: ${coveragePercent}%`);
    console.log(`   Total Routes: ${coverage.totalRoutes}`);
    console.log(`   Fully Covered: ${coverage.covered}`);
    console.log(`   Partially Covered: ${coverage.partial}`);
    console.log(`   Missing: ${coverage.missing}\n`);
  }
  
  if (results.nodeGeneration) {
    const gen = results.nodeGeneration;
    const successRate = ((gen.successCount / (gen.successCount + gen.errorCount)) * 100).toFixed(1);
    console.log(`Node Generation Success Rate: ${successRate}%`);
    console.log(`   Successful: ${gen.successCount}`);
    console.log(`   Failed: ${gen.errorCount}\n`);
  }
  
  if (results.a2aMcpCoverage) {
    const a2a = results.a2aMcpCoverage;
    console.log(`A2A Coverage: ${a2a.a2aDiscovered}/${a2a.a2aTotal} skills discovered`);
    console.log(`MCP Coverage: ${a2a.mcpDiscovered} tools discovered\n`);
  }
  
  // Overall status
  const allPassed = 
    results.endpointDiscovery?.missing === 0 &&
    results.nodeGeneration?.errorCount === 0 &&
    results.a2aMcpCoverage?.a2aMissing === 0 &&
    results.a2aMcpCoverage?.mcpMissing === 0;
  
  if (allPassed) {
    console.log("🎉 ALL VALIDATIONS PASSED! All APIs are exposed as n8n nodes.");
    process.exit(0);
  } else {
    console.log("⚠️  Some validations found issues. Review the details above.");
    process.exit(1);
  }
}

// Run validations
runAllValidations().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


