import { createMcpHandler } from "mcp-handler";
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// Mock weather data for demo purposes
// In production, you would integrate with a real weather API like OpenWeatherMap
const mockWeatherData: Record<string, {
  current: {
    temp: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    description: string;
    icon: string;
  };
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    description: string;
  }>;
}> = {
  "new york": {
    current: { temp: 72, feels_like: 75, humidity: 65, wind_speed: 8, description: "Partly cloudy", icon: "⛅" },
    forecast: [
      { date: "Tomorrow", high: 75, low: 62, description: "Sunny" },
      { date: "Day 3", high: 78, low: 65, description: "Clear" },
      { date: "Day 4", high: 73, low: 60, description: "Cloudy" },
      { date: "Day 5", high: 70, low: 58, description: "Rain" },
    ],
  },
  "london": {
    current: { temp: 59, feels_like: 57, humidity: 78, wind_speed: 12, description: "Overcast", icon: "☁️" },
    forecast: [
      { date: "Tomorrow", high: 61, low: 52, description: "Light rain" },
      { date: "Day 3", high: 58, low: 50, description: "Rainy" },
      { date: "Day 4", high: 62, low: 53, description: "Cloudy" },
      { date: "Day 5", high: 65, low: 55, description: "Partly cloudy" },
    ],
  },
  "tokyo": {
    current: { temp: 82, feels_like: 88, humidity: 72, wind_speed: 5, description: "Humid", icon: "🌤️" },
    forecast: [
      { date: "Tomorrow", high: 84, low: 75, description: "Hot" },
      { date: "Day 3", high: 86, low: 77, description: "Sunny" },
      { date: "Day 4", high: 83, low: 74, description: "Thunderstorms" },
      { date: "Day 5", high: 80, low: 72, description: "Cloudy" },
    ],
  },
  "san francisco": {
    current: { temp: 65, feels_like: 63, humidity: 70, wind_speed: 15, description: "Foggy", icon: "🌫️" },
    forecast: [
      { date: "Tomorrow", high: 68, low: 55, description: "Fog clearing" },
      { date: "Day 3", high: 72, low: 58, description: "Sunny" },
      { date: "Day 4", high: 70, low: 56, description: "Clear" },
      { date: "Day 5", high: 67, low: 54, description: "Fog" },
    ],
  },
};

// Default weather for unknown cities
const defaultWeather = {
  current: { temp: 70, feels_like: 70, humidity: 50, wind_speed: 10, description: "Clear", icon: "☀️" },
  forecast: [
    { date: "Tomorrow", high: 72, low: 60, description: "Sunny" },
    { date: "Day 3", high: 74, low: 62, description: "Clear" },
    { date: "Day 4", high: 71, low: 59, description: "Partly cloudy" },
    { date: "Day 5", high: 69, low: 57, description: "Cloudy" },
  ],
};

// Create MCP handler for Weather utilities
const mcpHandler = createMcpHandler(
  (server) => {
    // Tool 1: Get Current Weather
    server.tool(
      "get_current_weather",
      "Get the current weather conditions for a location. x402 payment: $0.001 per request.",
      {
        city: z
          .string()
          .describe("City name (e.g., 'New York', 'London', 'Tokyo')"),
        units: z
          .enum(["fahrenheit", "celsius"])
          .optional()
          .default("fahrenheit")
          .describe("Temperature units"),
      },
      async ({ city, units = "fahrenheit" }) => {
        try {
          const cityKey = city.toLowerCase();
          const weather = mockWeatherData[cityKey] || defaultWeather;
          
          const convertTemp = (temp: number) => {
            if (units === "celsius") {
              return Math.round((temp - 32) * 5 / 9);
            }
            return temp;
          };

          const result = {
            city: city,
            units: units,
            current: {
              temperature: convertTemp(weather.current.temp),
              feelsLike: convertTemp(weather.current.feels_like),
              humidity: weather.current.humidity,
              windSpeed: weather.current.wind_speed,
              description: weather.current.description,
              icon: weather.current.icon,
            },
            lastUpdated: new Date().toISOString(),
            // Note: In production, this would show actual x402 payment status
            x402: {
              charged: true,
              amount: "$0.001",
              txHash: `demo_${Date.now().toString(16)}`,
            },
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get weather",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 2: Get Weather Forecast
    server.tool(
      "get_weather_forecast",
      "Get a 5-day weather forecast for a location. x402 payment: $0.001 per request.",
      {
        city: z
          .string()
          .describe("City name"),
        units: z
          .enum(["fahrenheit", "celsius"])
          .optional()
          .default("fahrenheit")
          .describe("Temperature units"),
      },
      async ({ city, units = "fahrenheit" }) => {
        try {
          const cityKey = city.toLowerCase();
          const weather = mockWeatherData[cityKey] || defaultWeather;
          
          const convertTemp = (temp: number) => {
            if (units === "celsius") {
              return Math.round((temp - 32) * 5 / 9);
            }
            return temp;
          };

          const forecast = weather.forecast.map((day) => ({
            date: day.date,
            high: convertTemp(day.high),
            low: convertTemp(day.low),
            description: day.description,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  city,
                  units,
                  forecast,
                  generatedAt: new Date().toISOString(),
                  x402: {
                    charged: true,
                    amount: "$0.001",
                  },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get forecast",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Get Weather Alerts
    server.tool(
      "get_weather_alerts",
      "Check for active weather alerts in a region. x402 payment: $0.001 per request.",
      {
        city: z.string().describe("City name"),
        severity: z
          .enum(["all", "warning", "watch", "advisory"])
          .optional()
          .default("all")
          .describe("Filter by alert severity"),
      },
      async ({ city, severity = "all" }) => {
        try {
          // Mock alerts - in production, integrate with NWS or similar
          const mockAlerts = [
            {
              id: "alert-001",
              severity: "advisory",
              event: "Heat Advisory",
              headline: "Heat Advisory in effect until 8 PM",
              description: "High temperatures expected. Stay hydrated and limit outdoor activities.",
              expires: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            },
          ];

          const filteredAlerts = severity === "all" 
            ? mockAlerts 
            : mockAlerts.filter((a) => a.severity === severity);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  city,
                  activeAlerts: filteredAlerts.length,
                  alerts: filteredAlerts,
                  checkedAt: new Date().toISOString(),
                  x402: {
                    charged: true,
                    amount: "$0.001",
                  },
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: error instanceof Error ? error.message : "Failed to get alerts",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );
  },
  {},
  { basePath: "/api/mcp/demos" }
);

// GET handler - return server info (no auth required)
export async function GET() {
  return NextResponse.json({
    name: "Weather MCP",
    version: "1.0.0",
    description: "Real-time weather data, forecasts, and alerts with x402 micropayments",
    transport: ["http", "sse"],
    tools: [
      { name: "get_current_weather", description: "Get current weather conditions" },
      { name: "get_weather_forecast", description: "Get 5-day forecast" },
      { name: "get_weather_alerts", description: "Check active weather alerts" },
    ],
    pricing: { 
      type: "x402", 
      pricePerRequest: "$0.001",
      description: "Pay-per-request via x402 protocol",
    },
    x402: {
      enabled: true,
      network: "base",
      currency: "USDC",
      payTo: "0x...", // Placeholder - would be real address
    },
    status: "live",
  });
}

// POST handler - handle MCP protocol
// In production, x402 payment verification would happen here
export async function POST(req: NextRequest) {
  return await mcpHandler(req as unknown as Request);
}

