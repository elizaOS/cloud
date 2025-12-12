/**
 * API Proxy Route
 *
 * Forwards requests to Eliza Cloud API with proper authentication.
 * This allows the frontend to make requests without exposing the cloud URL.
 *
 * Maps: /api/proxy/* -> CLOUD_URL/api/v1/app/*
 */

import { NextRequest, NextResponse } from "next/server";

const CLOUD_URL = process.env.CLOUD_URL || "http://localhost:3000";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-App-Token, X-Api-Key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathString = path.join("/");

  // Build the target URL
  const targetUrl = new URL(`/api/v1/app/${pathString}`, CLOUD_URL);

  // Copy query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  // Build headers - forward auth token
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Forward auth token if present
  const appToken = request.headers.get("X-App-Token");
  const apiKey = request.headers.get("X-Api-Key");
  const authHeader = request.headers.get("Authorization");

  if (appToken) {
    headers["X-App-Token"] = appToken;
  }
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  // Get request body if present
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      body = text;
    }
  }

  // Make the request to cloud
  const response = await fetch(targetUrl.toString(), {
    method: request.method,
    headers,
    body,
  });

  // Get response data
  const responseText = await response.text();

  // Return proxied response with CORS headers
  return new NextResponse(responseText, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders,
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
