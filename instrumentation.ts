/**
 * Next.js Instrumentation
 * 
 * This file runs during server startup and is used to:
 * 1. Pre-warm the ElizaOS runtime infrastructure
 * 2. Set embedding dimensions without expensive API calls
 * 3. Initialize caches and connection pools
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server-side at runtime (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    console.log("[Instrumentation] Server starting - pre-warming ElizaOS runtime...");
    
    const startTime = Date.now();
    
    try {
      const { preWarmRuntime } = await import("@/lib/eliza/runtime-factory");
      
      await preWarmRuntime({
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      });
      
      console.log(`[Instrumentation] ✅ Runtime pre-warmed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.warn("[Instrumentation] ⚠️ Pre-warm failed (non-fatal):", error);
    }
  }
}

