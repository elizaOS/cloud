/**
 * MCP Response Helpers
 */

export function jsonResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResponse(message: string, details?: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message, ...details }, null, 2),
      },
    ],
    isError: true,
  };
}
