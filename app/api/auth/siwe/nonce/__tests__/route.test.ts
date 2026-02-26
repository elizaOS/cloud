import { NextRequest } from 'next/server';
import { GET as nonceEndpoint } from '../route';
import { describe, it, expect } from 'vitest';

describe("SIWE Nonce Endpoint", () => {
  it("should fail fast with 503 if cache unavailable", async () => {
    const { cache } = require('@/lib/cache/client');
    const original = cache.isAvailable;
    cache.isAvailable = () => false;
    
    const url = 'http://localhost:3000/api/auth/siwe/nonce?chainId=137';
    const req = new NextRequest(new Request(url, { method: 'GET' }));
    const response = await nonceEndpoint(req);
    expect(response.status).toBe(503);
    
    cache.isAvailable = original;
  });

  it("should return a valid nonce when cache is available", async () => {
    const url = 'http://localhost:3000/api/auth/siwe/nonce';
    const req = new NextRequest(new Request(url, { method: 'GET' }));
    const response = await nonceEndpoint(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.nonce).toMatch(/^[a-zA-Z0-9]{17,20}$/);
  });
});
