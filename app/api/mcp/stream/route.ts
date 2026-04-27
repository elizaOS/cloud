export async function GET() {
  return new Response(
    JSON.stringify({
      error: "SSE streaming is no longer supported. Use streamable-http transport.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST() {
  return new Response(
    JSON.stringify({
      error: "SSE streaming is no longer supported. Use streamable-http transport.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}
