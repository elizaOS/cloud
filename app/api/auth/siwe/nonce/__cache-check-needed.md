
Note: Issue 4 mentions that the nonce endpoint at `app/api/auth/siwe/nonce/route.ts` 
needs a cache availability check before calling cache.set(). However, this file was not 
provided in the actual file contents section, so I cannot make changes to it.

The fix would be to add before the cache.set() call:

```typescript
if (!cache.isAvailable()) {
  return NextResponse.json(
    {
      error: "SERVICE_UNAVAILABLE",
      message: "Authentication service temporarily unavailable. Please try again later.",
    },
    { status: 503 },
  );
}
```
