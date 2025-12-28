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
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server starting - pre-warming ElizaOS runtime...");
    
    const startTime = Date.now();
    
    try {
      // Dynamically import to avoid bundling issues
      const { preWarmRuntime } = await import("@/lib/eliza/runtime-factory");
      
      // Pre-warm with default embedding model
      await preWarmRuntime({
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      });
      
      console.log(`[Instrumentation] ✅ Runtime pre-warmed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.warn("[Instrumentation] ⚠️ Pre-warm failed (non-fatal):", error);
    }
  }
}

