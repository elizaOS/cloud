# MCP Playground

An interactive dashboard to explore, test, and integrate with Model Context Protocol (MCP) servers hosted on ElizaOS Cloud.

## Overview

The MCP Playground provides a comprehensive interface for developers to:

- Discover available MCP servers and their capabilities
- Test MCP tools with live parameter validation
- View real-time execution results
- Copy integration code examples
- Understand pricing and cost structure

## Features

### 🔍 MCP Explorer

- Browse all available MCP servers by category
- View detailed tool documentation
- Filter by category (Platform, Crypto, Social, AI)
- Filter by payment type (x402 Protocol, Credit-Based)
- Search across MCPs and tools

### 🔌 Connection Information

- **Raw endpoint URLs** displayed for each MCP
- **MCP configuration templates** for Claude Desktop and custom agents
- One-click copy for endpoint URLs
- Ready-to-use JSON configuration snippets
- Connection instructions for agent integration

### ⚡ Interactive Testing

- Dynamic parameter editor with type validation
- Support for all parameter types:
  - String (text input / textarea)
  - Number (with min/max validation)
  - Boolean (toggle)
  - Enum (dropdown select)
  - Array/Object (JSON editor)
- Real-time execution with loading states
- Comprehensive error handling

### 📊 Results Viewer

- Formatted JSON response display
- Success/Error status badges
- Copy-to-clipboard functionality
- Syntax highlighting

### 💻 Code Generation

- Auto-generated integration examples
- MCP protocol-compliant request format
- Copy-ready code snippets
- Support for both credit-based and x402 payment protocols

### 💳 x402 Visual Indicators

- Wallet badges on x402-enabled MCPs
- Credit card badges for credit-based MCPs
- Payment type filter dropdown
- Inline x402 protocol explanations
- Color-coded payment method identification

## Available MCPs

### 1. ElizaOS Cloud MCP

**Category:** Platform  
**Endpoint:** `/api/mcp`  
**Pricing:** Credit-based (varies per tool)

**Tools:**

- `check_credits` - View credit balance and transactions (FREE)
- `get_recent_usage` - API usage statistics (FREE)
- `generate_text` - AI text generation (token-based, ~$0.0001-$0.01)
- `generate_image` - AI image generation ($0.01)
- `save_memory` - Long-term memory storage ($0.001)
- `retrieve_memories` - Semantic memory search ($0.0001-$0.01)
- `chat_with_agent` - Agent conversation (token-based, ~$0.001-$0.01)
- `create_conversation` - Create conversation ($0.01)
- `search_conversations` - Search conversations ($0.01)
- `export_conversation` - Export conversation ($0.05)
- `analyze_memories` - Analyze memories ($0.10)
- `list_agents` - View available agents (FREE)
- `list_containers` - View deployments (FREE)

### 2. CoinGecko Crypto API

**Category:** Crypto  
**Endpoint:** `/api/mcp/coingecko`  
**Pricing:** x402 ($0.01-$0.05 per call)

**Tools:**

- `get_coin_price` - Real-time crypto prices ($0.02)
- `get_market_chart` - Historical price data ($0.05)
- `get_trending_coins` - Top trending cryptos ($0.03)
- `search_coins` - Search 10,000+ coins ($0.01)
- `get_global_market_data` - Market statistics ($0.02)

### 3. Twitter/X Data API

**Category:** Social  
**Endpoint:** `/api/mcp/twitter`  
**Pricing:** x402 ($0.03-$0.10 per call)

**Tools:**

- `get_trending_topics` - Trending hashtags ($0.10)
- `search_tweets` - Search recent tweets ($0.05)
- `get_user_info` - User profile data ($0.03)

### 4. OpenAI Image Generator

**Category:** AI  
**Endpoint:** `/api/mcp/openai`  
**Pricing:** x402 ($0.50 per image)

**Tools:**

- `generate_image` - High-quality AI images with gpt-image-1 ($0.50)
  - Supports custom sizes, quality levels, backgrounds, and formats

## Usage

### Accessing the Playground

Navigate to `/mcp-playground` in the ElizaOS Cloud dashboard or click "MCP Playground" in the sidebar under "Agent Development".

### Connecting Your Agent

Each MCP displays its connection information in the header:

1. **View the endpoint URL** - Full URL for the MCP server
2. **Copy the endpoint** - One-click copy button
3. **Expand "Connect Your Agent"** - Shows MCP configuration template

**Example MCP Configuration:**

```json
{
  "mcpServers": {
    "coingecko": {
      "url": "https://your-domain.com/api/mcp/coingecko",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

Add this to:

- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Custom Agents**: Your MCP client configuration
- **ElizaOS**: Plugin MCP configuration

### Testing a Tool

1. **Select an MCP** from the left sidebar
2. **Choose a tool** from the tabs at the top
3. **Fill in parameters** using the interactive form
4. **Click "Execute Tool"** to run the test
5. **View results** in the formatted JSON viewer
6. **Copy endpoint or code** examples for integration

### Example: Testing CoinGecko Price API

```typescript
// 1. Select "CoinGecko Crypto API" from sidebar
// 2. Click "get_coin_price" tab
// 3. Fill in parameters:
//    - coin_id: "bitcoin"
//    - vs_currency: "usd"
//    - include_24hr_change: true
// 4. Click "Execute Tool"

// Generated Code:
const response = await fetch("/api/mcp/coingecko", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_API_KEY",
  },
  body: JSON.stringify({
    method: "tools/call",
    params: {
      name: "get_coin_price",
      arguments: {
        coin_id: "bitcoin",
        vs_currency: "usd",
        include_24hr_change: true,
      },
    },
  }),
});

const data = await response.json();
```

## Payment Protocols

### Credit-Based (ElizaOS Cloud MCP)

- Uses internal credit system
- Credits purchased via Stripe
- Automatic deduction on execution
- Balance visible in dashboard

### x402 Protocol (External MCPs)

- Pay-per-call via Coinbase x402
- Cryptocurrency payments (Base network)
- Transparent pricing per tool
- No subscription required

## Architecture

```
app/mcp-playground/
├── page.tsx                          # Server component
└── README.md                         # This file

components/mcp-playground/
└── mcp-playground-client.tsx         # Client component with interactive UI

app/api/mcp/
├── route.ts                          # ElizaOS Cloud MCP handler
├── list/
│   └── route.ts                      # MCP discovery endpoint
├── coingecko/
│   └── route.ts                      # CoinGecko MCP handler
├── twitter/
│   └── route.ts                      # Twitter MCP handler
└── openai/
    └── route.ts                      # OpenAI Image MCP handler
```

## Development

### Adding a New MCP

1. **Create the MCP handler:**

```typescript
// app/api/mcp/your-mcp/route.ts
import { createPaidMcpHandler } from "x402-mcp";
import { facilitator } from "@coinbase/x402";
import { getOrCreateSellerAccount, env } from "@/lib/accounts";

const sellerAccount = await getOrCreateSellerAccount();

const handler = createPaidMcpHandler(
  (server) => {
    server.paidTool(
      "your_tool",
      "Tool description",
      { price: 0.01 },
      {
        /* parameters */
      },
      {},
      async (args) => {
        // Tool implementation
        return { content: [{ type: "text", text: "Result" }] };
      },
    );
  },
  { serverInfo: { name: "your-mcp", version: "1.0.0" } },
  { recipient: sellerAccount.address, facilitator, network: env.NETWORK },
);

export { handler as GET, handler as POST };
```

2. **Register in the list endpoint:**

```typescript
// app/api/mcp/list/route.ts
const mcpDefinitions = [
  // ... existing MCPs
  {
    id: "your-mcp",
    name: "Your MCP Name",
    description: "MCP description",
    endpoint: "/api/mcp/your-mcp",
    category: "your-category",
    tools: [
      /* tool definitions */
    ],
  },
];
```

3. **Test in the playground** - it will automatically appear!

### Parameter Types

The playground supports automatic rendering for:

- **string**: Text input or textarea (based on maxLength)
- **number**: Number input with min/max validation
- **boolean**: True/False select dropdown
- **enum**: Dropdown with predefined options
- **array**: JSON editor (future)
- **object**: JSON editor (future)

## Troubleshooting

### Tool execution fails

- Check API key is valid
- Verify sufficient credits (for credit-based MCPs)
- Ensure parameters match required schema
- Check network connectivity

### MCP not appearing

- Verify MCP is registered in `/api/mcp/list`
- Check MCP handler is deployed
- Clear browser cache

### Payment issues

- For credit-based: Check credit balance in dashboard
- For x402: Ensure wallet is connected and funded

## Future Enhancements

- [ ] Real-time streaming support for long-running tools
- [ ] Batch execution for multiple tools
- [ ] Test history and saved configurations
- [ ] Export test cases as automated tests
- [ ] GraphQL playground for MCP introspection
- [ ] Webhook testing and debugging
- [ ] Rate limit visualization
- [ ] Cost calculator and projections

## Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [x402 Payment Protocol](https://github.com/coinbase/x402)
- [ElizaOS Documentation](https://elizaos.github.io/eliza/)
- [API Explorer](/dashboard/api-explorer)

## Support

For issues or questions:

- GitHub Issues: [eliza-cloud-v2](https://github.com/your-org/eliza-cloud-v2)
- Discord: [ElizaOS Community](https://discord.gg/elizaos)
- Email: support@elizaos.ai
