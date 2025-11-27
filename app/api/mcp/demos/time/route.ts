import { createMcpHandler } from "mcp-handler";
import { z } from "zod3";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// Create MCP handler for Time & Date utilities
const mcpHandler = createMcpHandler(
  (server) => {
    // Tool 1: Get Current Time
    server.tool(
      "get_current_time",
      "Get the current date and time in various formats",
      {
        timezone: z
          .string()
          .optional()
          .default("UTC")
          .describe("IANA timezone (e.g., 'America/New_York', 'Europe/London')"),
        format: z
          .enum(["iso", "unix", "readable", "all"])
          .optional()
          .default("all")
          .describe("Output format"),
      },
      async ({ timezone = "UTC", format = "all" }) => {
        try {
          const now = new Date();
          
          const formatters = {
            date: new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              dateStyle: "full",
            }),
            time: new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              timeStyle: "long",
            }),
            datetime: new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              dateStyle: "full",
              timeStyle: "long",
            }),
          };

          const result: Record<string, string | number> = {};

          if (format === "iso" || format === "all") {
            result.iso = now.toISOString();
          }
          if (format === "unix" || format === "all") {
            result.unix = Math.floor(now.getTime() / 1000);
            result.unixMs = now.getTime();
          }
          if (format === "readable" || format === "all") {
            result.date = formatters.date.format(now);
            result.time = formatters.time.format(now);
            result.datetime = formatters.datetime.format(now);
          }
          if (format === "all") {
            result.timezone = timezone;
            result.dayOfWeek = new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              weekday: "long",
            }).format(now);
          }

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
                  error: error instanceof Error ? error.message : "Failed to get time",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 2: Convert Timezone
    server.tool(
      "convert_timezone",
      "Convert a time between different timezones",
      {
        time: z
          .string()
          .describe("Time to convert (ISO format or 'now')"),
        fromTimezone: z
          .string()
          .describe("Source timezone (IANA format)"),
        toTimezone: z
          .string()
          .describe("Target timezone (IANA format)"),
      },
      async ({ time, fromTimezone, toTimezone }) => {
        try {
          const date = time === "now" ? new Date() : new Date(time);
          
          if (isNaN(date.getTime())) {
            throw new Error("Invalid time format");
          }

          const fromFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: fromTimezone,
            dateStyle: "full",
            timeStyle: "long",
          });

          const toFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: toTimezone,
            dateStyle: "full",
            timeStyle: "long",
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  original: {
                    timezone: fromTimezone,
                    formatted: fromFormatter.format(date),
                  },
                  converted: {
                    timezone: toTimezone,
                    formatted: toFormatter.format(date),
                  },
                  iso: date.toISOString(),
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
                  error: error instanceof Error ? error.message : "Failed to convert timezone",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Format Date
    server.tool(
      "format_date",
      "Format a date in various styles and locales",
      {
        date: z
          .string()
          .describe("Date to format (ISO format or 'now')"),
        locale: z
          .string()
          .optional()
          .default("en-US")
          .describe("Locale for formatting (e.g., 'en-US', 'de-DE', 'ja-JP')"),
        style: z
          .enum(["short", "medium", "long", "full"])
          .optional()
          .default("long")
          .describe("Date style"),
      },
      async ({ date, locale = "en-US", style = "long" }) => {
        try {
          const dateObj = date === "now" ? new Date() : new Date(date);
          
          if (isNaN(dateObj.getTime())) {
            throw new Error("Invalid date format");
          }

          const styles = ["short", "medium", "long", "full"] as const;
          const formatted: Record<string, string> = {};

          styles.forEach((s) => {
            formatted[s] = new Intl.DateTimeFormat(locale, {
              dateStyle: s,
            }).format(dateObj);
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  requested: formatted[style],
                  allFormats: formatted,
                  locale,
                  iso: dateObj.toISOString(),
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
                  error: error instanceof Error ? error.message : "Failed to format date",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 4: Calculate Time Difference
    server.tool(
      "calculate_time_diff",
      "Calculate the difference between two dates/times",
      {
        startDate: z
          .string()
          .describe("Start date/time (ISO format or 'now')"),
        endDate: z
          .string()
          .describe("End date/time (ISO format or 'now')"),
        unit: z
          .enum(["auto", "seconds", "minutes", "hours", "days", "weeks", "months", "years"])
          .optional()
          .default("auto")
          .describe("Unit for the difference"),
      },
      async ({ startDate, endDate, unit = "auto" }) => {
        try {
          const start = startDate === "now" ? new Date() : new Date(startDate);
          const end = endDate === "now" ? new Date() : new Date(endDate);
          
          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error("Invalid date format");
          }

          const diffMs = end.getTime() - start.getTime();
          const diffSec = Math.floor(diffMs / 1000);
          const diffMin = Math.floor(diffSec / 60);
          const diffHours = Math.floor(diffMin / 60);
          const diffDays = Math.floor(diffHours / 24);
          const diffWeeks = Math.floor(diffDays / 7);
          const diffMonths = Math.floor(diffDays / 30.44);
          const diffYears = Math.floor(diffDays / 365.25);

          const all = {
            milliseconds: diffMs,
            seconds: diffSec,
            minutes: diffMin,
            hours: diffHours,
            days: diffDays,
            weeks: diffWeeks,
            months: diffMonths,
            years: diffYears,
          };

          let primary: { value: number; unit: string };
          if (unit !== "auto") {
            primary = { value: all[unit as keyof typeof all], unit };
          } else {
            // Auto-select best unit
            if (Math.abs(diffYears) >= 1) {
              primary = { value: diffYears, unit: "years" };
            } else if (Math.abs(diffMonths) >= 1) {
              primary = { value: diffMonths, unit: "months" };
            } else if (Math.abs(diffWeeks) >= 1) {
              primary = { value: diffWeeks, unit: "weeks" };
            } else if (Math.abs(diffDays) >= 1) {
              primary = { value: diffDays, unit: "days" };
            } else if (Math.abs(diffHours) >= 1) {
              primary = { value: diffHours, unit: "hours" };
            } else if (Math.abs(diffMin) >= 1) {
              primary = { value: diffMin, unit: "minutes" };
            } else {
              primary = { value: diffSec, unit: "seconds" };
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  primary,
                  allUnits: all,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  direction: diffMs >= 0 ? "future" : "past",
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
                  error: error instanceof Error ? error.message : "Failed to calculate difference",
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
    name: "Time & Date MCP",
    version: "1.0.0",
    description: "Get current time, timezone conversions, and date calculations",
    transport: ["http", "sse"],
    tools: [
      { name: "get_current_time", description: "Get current date and time", cost: "1 credit" },
      { name: "convert_timezone", description: "Convert between timezones", cost: "1 credit" },
      { name: "format_date", description: "Format dates in various styles", cost: "1 credit" },
      { name: "calculate_time_diff", description: "Calculate time differences", cost: "1 credit" },
    ],
    pricing: { 
      type: "credits",
      description: "1 credit per request",
      creditsPerRequest: 1,
    },
    status: "live",
  });
}

// POST handler - handle MCP protocol
export async function POST(req: NextRequest) {
  return await mcpHandler(req as unknown as Request);
}

