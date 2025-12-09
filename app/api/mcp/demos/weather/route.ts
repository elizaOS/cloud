import { NextResponse } from "next/server";
import { X402_RECIPIENT_ADDRESS, getDefaultNetwork } from "@/lib/config/x402";

/**
 * GET /api/mcp/demos/weather
 * Metadata endpoint for Weather MCP server.
 * Returns information about available weather tools, pricing, and data sources.
 *
 * @returns MCP server metadata including tools, pricing, and feature list.
 */
export async function GET() {
  return NextResponse.json({
    name: "Weather MCP",
    version: "2.0.0",
    description:
      "Real-time weather data, forecasts, and location search powered by Open-Meteo API with x402 micropayments.",
    transport: ["http", "sse"],
    endpoint: "/api/mcp/demos/weather/mcp",
    tools: [
      {
        name: "get_current_weather",
        description: "Get current weather conditions for any city",
        price: "$0.0001",
        example: { city: "New York", units: "fahrenheit" },
      },
      {
        name: "get_weather_forecast",
        description: "Get multi-day forecast (up to 16 days)",
        price: "$0.0002",
        example: { city: "London", days: 7 },
      },
      {
        name: "compare_weather",
        description: "Compare weather between multiple cities",
        price: "$0.0002",
        example: { cities: ["Tokyo", "New York", "London"] },
      },
      {
        name: "search_location",
        description: "Search for location coordinates and timezone",
        price: "$0.0001",
        example: { query: "San Francisco" },
      },
    ],
    payment: {
      protocol: "x402",
      network: getDefaultNetwork(),
      currency: "USDC",
      recipient: X402_RECIPIENT_ADDRESS,
      priceRange: "$0.0001 - $0.0002 per request",
    },
    dataSource: {
      provider: "Open-Meteo",
      type: "real-time",
      cacheTime: "5 minutes",
      coverage: "Global",
    },
    features: [
      "Current conditions",
      "16-day forecasts",
      "Precipitation probability",
      "UV index",
      "Sunrise/sunset times",
      "Wind speed and direction",
      "Global location search",
    ],
    status: "live",
  });
}
