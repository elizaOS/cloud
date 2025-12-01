import { NextResponse } from "next/server";

const RECIPIENT_WALLET = (process.env.X402_RECIPIENT_WALLET ||
  process.env.CDP_WALLET_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Metadata endpoint for Time & Date MCP
export async function GET() {
  return NextResponse.json({
    name: "Time & Date MCP",
    version: "2.0.0",
    description:
      "Real-time date/time utilities with timezone conversion, formatting, and calculations using native JavaScript Intl APIs.",
    transport: ["http", "sse"],
    endpoint: "/api/mcp/demos/time/mcp",
    tools: [
      {
        name: "get_current_time",
        description: "Get current date and time in any timezone",
        price: "$0.0001",
        example: { timezone: "America/New_York", format: "all" },
      },
      {
        name: "convert_timezone",
        description: "Convert times between timezones",
        price: "$0.0001",
        example: { time: "now", fromTimezone: "PST", toTimezone: "JST" },
      },
      {
        name: "format_date",
        description: "Format dates in various locales and styles",
        price: "$0.0001",
        example: { date: "now", locale: "ja-JP" },
      },
      {
        name: "calculate_time_diff",
        description: "Calculate difference between two dates",
        price: "$0.0001",
        example: { startDate: "2024-01-01", endDate: "now" },
      },
      {
        name: "list_timezones",
        description: "List common timezones with current offsets",
        price: "$0.0001",
        example: { filter: "America" },
      },
    ],
    payment: {
      protocol: "x402",
      network: "base",
      currency: "USDC",
      recipient: RECIPIENT_WALLET,
      pricePerRequest: "$0.0001",
    },
    features: [
      "Accurate timezone handling via IANA database",
      "Timezone aliases (PST, EST, JST, etc.)",
      "Multi-locale date formatting",
      "Relative time calculations",
      "Unix timestamp conversions",
      "Leap year detection",
      "Week/day of year calculations",
    ],
    status: "live",
  });
}
