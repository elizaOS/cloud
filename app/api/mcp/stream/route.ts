export async function GET() {
  return new Response(
    JSON.stringify({
      error: "SSE streaming is deprecated. Use streamable-http transport.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST() {
  return new Response(
    JSON.stringify({
      error: "SSE streaming is deprecated. Use streamable-http transport.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}
