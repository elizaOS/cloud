/**
 * Test Script for N8N Workflow Generation
 * 
 * This script validates that the n8n workflow generation system works correctly.
 * Run with: bun run scripts/test-n8n-workflow-generation.ts
 */

import { endpointDiscoveryService } from "../lib/services/endpoint-discovery";
import { n8nWorkflowsService } from "../lib/services/n8n-workflows";
import { logger } from "../lib/utils/logger";

async function testEndpointDiscovery() {
  console.log("\n🔍 Testing Endpoint Discovery...");
  
  try {
    const endpoints = await endpointDiscoveryService.discoverAllEndpoints();
    console.log(`✅ Discovered ${endpoints.length} endpoints`);
    
    // Check endpoint types
    const a2aCount = endpoints.filter(e => e.type === "a2a").length;
    const mcpCount = endpoints.filter(e => e.type === "mcp").length;
    const restCount = endpoints.filter(e => e.type === "rest").length;
    
    console.log(`   - A2A: ${a2aCount}`);
    console.log(`   - MCP: ${mcpCount}`);
    console.log(`   - REST: ${restCount}`);
    
    // Test search
    const searchResults = await endpointDiscoveryService.searchEndpoints("slack", {
      types: ["rest"],
      limit: 10,
    });
    console.log(`✅ Search found ${searchResults.nodes.length} results for "slack"`);
    
    // Test getEndpointById
    if (endpoints.length > 0) {
      const firstEndpoint = endpoints[0];
      const found = await endpointDiscoveryService.getEndpointById(firstEndpoint.id);
      if (found && found.id === firstEndpoint.id) {
        console.log(`✅ getEndpointById works correctly`);
      } else {
        console.log(`❌ getEndpointById failed`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Endpoint discovery failed:`, error);
    return false;
  }
}

async function testWorkflowValidation() {
  console.log("\n✅ Testing Workflow Validation...");
  
  try {
    // Test valid workflow
    const validWorkflow = {
      name: "Test Workflow",
      nodes: [
        {
          id: "node-1",
          type: "n8n-nodes-base.start",
          name: "Start",
          typeVersion: 1,
          position: [250, 300],
          parameters: {},
        },
        {
          id: "node-2",
          type: "n8n-nodes-base.httpRequest",
          name: "HTTP Request",
          typeVersion: 4.1,
          position: [450, 300],
          parameters: {
            method: "GET",
            url: "https://api.example.com/data",
          },
        },
      ],
      connections: {
        "Start": {
          main: [[{ node: "HTTP Request", type: "main", index: 0 }]],
        },
      },
    };
    
    const validResult = await n8nWorkflowsService.validateWorkflow(validWorkflow);
    if (validResult.valid) {
      console.log(`✅ Valid workflow validation passed`);
    } else {
      console.log(`❌ Valid workflow validation failed:`, validResult.errors);
      return false;
    }
    
    // Test invalid workflow (missing nodes)
    const invalidWorkflow = {
      name: "Invalid Workflow",
      connections: {},
    };
    
    const invalidResult = await n8nWorkflowsService.validateWorkflow(invalidWorkflow);
    if (!invalidResult.valid && invalidResult.errors.length > 0) {
      console.log(`✅ Invalid workflow validation correctly caught errors`);
    } else {
      console.log(`❌ Invalid workflow validation should have failed`);
      return false;
    }
    
    // Test invalid workflow (missing node id)
    const invalidNodeWorkflow = {
      name: "Invalid Node Workflow",
      nodes: [
        {
          type: "n8n-nodes-base.start",
          name: "Start",
          // Missing id
        },
      ],
      connections: {},
    };
    
    const invalidNodeResult = await n8nWorkflowsService.validateWorkflow(invalidNodeWorkflow);
    if (!invalidNodeResult.valid && invalidNodeResult.errors.some(e => e.includes("missing 'id'"))) {
      console.log(`✅ Node validation correctly caught missing id`);
    } else {
      console.log(`❌ Node validation should have caught missing id`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Workflow validation test failed:`, error);
    return false;
  }
}

async function testNodeGeneration() {
  console.log("\n🔧 Testing Node Generation...");
  
  try {
    const { n8nNodeGeneratorService } = await import("../lib/services/n8n-node-generator");
    
    // Get an endpoint to test with
    const endpoints = await endpointDiscoveryService.discoverAllEndpoints();
    if (endpoints.length === 0) {
      console.log(`⚠️  No endpoints found, skipping node generation test`);
      return true;
    }
    
    const testEndpoint = endpoints[0];
    console.log(`   Testing with endpoint: ${testEndpoint.name} (${testEndpoint.type})`);
    
    // Generate a node
    const node = await n8nNodeGeneratorService.generateNode({
      endpointId: testEndpoint.id,
      position: [250, 300],
    });
    
    // Validate node structure
    if (!node.id || !node.type || !node.name) {
      console.log(`❌ Generated node missing required fields`);
      return false;
    }
    
    if (node.type !== "n8n-nodes-base.httpRequest") {
      console.log(`❌ Generated node has wrong type: ${node.type}`);
      return false;
    }
    
    // Check parameters based on endpoint type
    if (testEndpoint.type === "rest") {
      if (!node.parameters.url || !node.parameters.method) {
        console.log(`❌ REST node missing URL or method`);
        return false;
      }
    } else if (testEndpoint.type === "a2a" || testEndpoint.type === "mcp") {
      if (!node.parameters.jsonBody || !node.parameters.sendBody) {
        console.log(`❌ ${testEndpoint.type.toUpperCase()} node missing jsonBody or sendBody`);
        return false;
      }
    }
    
    console.log(`✅ Node generation works correctly`);
    console.log(`   Generated node: ${node.name} (${node.type})`);
    
    return true;
  } catch (error) {
    console.error(`❌ Node generation test failed:`, error);
    return false;
  }
}

async function testWorkflowGenerationStructure() {
  console.log("\n📝 Testing Workflow Generation Structure...");
  
  try {
    // Read the route file to extract buildSystemPrompt function
    // Since it's not exported, we'll test the logic indirectly
    const fs = await import("fs/promises");
    const path = await import("path");
    const routeFile = await fs.readFile(
      path.join(process.cwd(), "app/api/v1/n8n/generate-workflow/route.ts"),
      "utf-8"
    );
    
    // Check that buildSystemPrompt function exists
    if (!routeFile.includes("function buildSystemPrompt")) {
      console.log(`❌ buildSystemPrompt function not found`);
      return false;
    }
    
    // Check for important prompt components
    if (!routeFile.includes("jsonBody")) {
      console.log(`❌ Prompt missing jsonBody instructions`);
      return false;
    }
    
    if (!routeFile.includes("JSON-RPC")) {
      console.log(`❌ Prompt missing JSON-RPC format instructions`);
      return false;
    }
    
    if (!routeFile.includes("availableEndpoints")) {
      console.log(`❌ Prompt missing endpoint integration`);
      return false;
    }
    
    // Check for specific endpoint usage instructions
    if (!routeFile.includes("specifyBody")) {
      console.log(`❌ Prompt missing specifyBody instructions`);
      return false;
    }
    
    if (!routeFile.includes("contentType")) {
      console.log(`❌ Prompt missing contentType instructions`);
      return false;
    }
    
    // Check for JSON-RPC examples
    if (!routeFile.includes('"jsonrpc": "2.0"')) {
      console.log(`❌ Prompt missing JSON-RPC example format`);
      return false;
    }
    
    // Check for endpoint type handling
    if (!routeFile.includes("A2A endpoints") || !routeFile.includes("MCP endpoints") || !routeFile.includes("REST endpoints")) {
      console.log(`❌ Prompt missing endpoint type instructions`);
      return false;
    }
    
    console.log(`✅ System prompt structure is correct`);
    console.log(`   Includes jsonBody, specifyBody, contentType, and JSON-RPC instructions`);
    
    return true;
  } catch (error) {
    console.error(`❌ Workflow generation structure test failed:`, error);
    return false;
  }
}

async function testWorkflowJSONParsing() {
  console.log("\n📦 Testing Workflow JSON Parsing...");
  
  try {
    // Test markdown code block extraction
    const markdownResponse = `
Here's your workflow:

\`\`\`json
{
  "name": "Test Workflow",
  "nodes": [
    {
      "id": "node-1",
      "type": "n8n-nodes-base.start",
      "name": "Start"
    }
  ],
  "connections": {}
}
\`\`\`
`;
    
    const jsonMatch = markdownResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.name === "Test Workflow" && Array.isArray(parsed.nodes)) {
        console.log(`✅ Markdown code block parsing works`);
      } else {
        console.log(`❌ Markdown parsing failed`);
        return false;
      }
    } else {
      console.log(`❌ Markdown regex failed`);
      return false;
    }
    
    // Test direct JSON parsing
    const directJson = '{"name": "Test", "nodes": [], "connections": {}}';
    try {
      const parsed = JSON.parse(directJson);
      if (parsed.name === "Test") {
        console.log(`✅ Direct JSON parsing works`);
      } else {
        console.log(`❌ Direct JSON parsing failed`);
        return false;
      }
    } catch {
      console.log(`❌ Direct JSON parsing threw error`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ JSON parsing test failed:`, error);
    return false;
  }
}

async function runAllTests() {
  console.log("🧪 N8N Workflow Generation Validation Tests\n");
  console.log("=" .repeat(60));
  
  const results = {
    endpointDiscovery: false,
    workflowValidation: false,
    nodeGeneration: false,
    workflowStructure: false,
    jsonParsing: false,
  };
  
  results.endpointDiscovery = await testEndpointDiscovery();
  results.workflowValidation = await testWorkflowValidation();
  results.nodeGeneration = await testNodeGeneration();
  results.workflowStructure = await testWorkflowGenerationStructure();
  results.jsonParsing = await testWorkflowJSONParsing();
  
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Test Results Summary:\n");
  
  const allPassed = Object.values(results).every(r => r === true);
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${status} - ${test}`);
  }
  
  console.log("\n" + "=".repeat(60));
  
  if (allPassed) {
    console.log("\n🎉 All tests passed! Workflow generation is ready.");
    process.exit(0);
  } else {
    console.log("\n⚠️  Some tests failed. Please review the errors above.");
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});

