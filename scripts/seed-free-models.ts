import { db } from "@/db/client";
import { modelCategories } from "@/db/schemas/model-categories";

const freeModels = [
  // FREE TIER MODELS (subsidized by platform)
  {
    model: "gpt-4o-mini",
    provider: "openai",
    category: "free",
    tier_required: null,
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
    features: {
      max_tokens: 16384,
      supports_streaming: true,
      supports_vision: true,
      supports_tools: true,
    },
    metadata: {
      description: "GPT-4o Mini - Fast, cost-effective model with vision support",
      context_window: 128000,
      pricing: "Platform subsidized - no credits charged to user",
    },
  },
  {
    model: "gemini-1.5-flash",
    provider: "google",
    category: "free",
    tier_required: null,
    rate_limit_per_minute: 30,
    rate_limit_per_day: 5000,
    features: {
      max_tokens: 8192,
      supports_streaming: true,
      supports_vision: true,
    },
    metadata: {
      description: "Gemini 1.5 Flash - Fast, multimodal model from Google",
      context_window: 1000000,
      pricing: "Platform subsidized - no credits charged to user",
    },
  },
  {
    model: "gpt-3.5-turbo",
    provider: "openai",
    category: "free",
    tier_required: null,
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
    features: {
      max_tokens: 4096,
      supports_streaming: true,
      supports_tools: true,
    },
    metadata: {
      description: "GPT-3.5 Turbo - Classic model for general tasks",
      context_window: 16385,
      pricing: "Platform subsidized - no credits charged to user",
    },
  },
  {
    model: "text-embedding-3-small",
    provider: "openai",
    category: "free",
    tier_required: null,
    rate_limit_per_minute: 100,
    rate_limit_per_day: 50000,
    features: {
      dimensions: 1536,
      max_batch_size: 100,
    },
    metadata: {
      description: "OpenAI Text Embedding 3 Small - Efficient embedding model",
      type: "embedding",
      pricing: "Platform subsidized - no credits charged to user",
    },
  },
  {
    model: "text-embedding-ada-002",
    provider: "openai",
    category: "free",
    tier_required: null,
    rate_limit_per_minute: 100,
    rate_limit_per_day: 50000,
    features: {
      dimensions: 1536,
      max_batch_size: 100,
    },
    metadata: {
      description: "OpenAI Ada 002 - Legacy embedding model",
      type: "embedding",
      pricing: "Platform subsidized - no credits charged to user",
    },
  },

  // PAID MODELS (user credits charged)
  {
    model: "gpt-4o",
    provider: "openai",
    category: "paid",
    tier_required: null,
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
    features: {
      max_tokens: 16384,
      supports_streaming: true,
      supports_tools: true,
      supports_vision: true,
    },
    metadata: {
      description: "GPT-4 Omni - Advanced multimodal model",
      context_window: 128000,
      pricing: "$2.50 per 1M input tokens, $10.00 per 1M output tokens",
    },
  },
  {
    model: "gpt-4-turbo",
    provider: "openai",
    category: "paid",
    tier_required: null,
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
    features: {
      max_tokens: 4096,
      supports_streaming: true,
      supports_tools: true,
      supports_vision: true,
    },
    metadata: {
      description: "GPT-4 Turbo - Previous generation flagship model",
      context_window: 128000,
      pricing: "$10.00 per 1M input tokens, $30.00 per 1M output tokens",
    },
  },
  {
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    category: "premium",
    tier_required: null,
    rate_limit_per_minute: 50,
    rate_limit_per_day: 5000,
    features: {
      max_tokens: 8192,
      supports_streaming: true,
      supports_tools: true,
      supports_vision: true,
    },
    metadata: {
      description: "Claude 3.5 Sonnet - Advanced reasoning and coding model",
      context_window: 200000,
      pricing: "$3.00 per 1M input tokens, $15.00 per 1M output tokens",
    },
  },
  {
    model: "claude-3-5-haiku-20241022",
    provider: "anthropic",
    category: "paid",
    tier_required: null,
    rate_limit_per_minute: 60,
    rate_limit_per_day: 10000,
    features: {
      max_tokens: 8192,
      supports_streaming: true,
      supports_tools: true,
    },
    metadata: {
      description: "Claude 3.5 Haiku - Fast, intelligent model",
      context_window: 200000,
      pricing: "$1.00 per 1M input tokens, $5.00 per 1M output tokens",
    },
  },
  {
    model: "gemini-1.5-pro",
    provider: "google",
    category: "premium",
    tier_required: null,
    rate_limit_per_minute: 30,
    rate_limit_per_day: 3000,
    features: {
      max_tokens: 8192,
      supports_streaming: true,
      supports_vision: true,
      supports_tools: true,
    },
    metadata: {
      description: "Gemini 1.5 Pro - Advanced multimodal model with 2M context",
      context_window: 2000000,
      pricing: "$1.25 per 1M input tokens, $5.00 per 1M output tokens",
    },
  },
  {
    model: "text-embedding-3-large",
    provider: "openai",
    category: "paid",
    tier_required: null,
    rate_limit_per_minute: 100,
    rate_limit_per_day: 50000,
    features: {
      dimensions: 3072,
      max_batch_size: 100,
    },
    metadata: {
      description: "OpenAI Text Embedding 3 Large - High-quality embeddings",
      type: "embedding",
      pricing: "$0.13 per 1M input tokens",
    },
  },
];

async function seedFreeModels() {
  console.log("🌱 Seeding model categories...");

  for (const model of freeModels) {
    try {
      await db.insert(modelCategories).values({
        model: model.model,
        provider: model.provider,
        category: model.category,
        tier_required: model.tier_required,
        rate_limit_per_minute: model.rate_limit_per_minute,
        rate_limit_per_day: model.rate_limit_per_day,
        is_active: true,
        features: model.features,
        metadata: model.metadata,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const badge = model.category === "free" ? "🆓 FREE" : model.category === "premium" ? "💎 PREMIUM" : "💳 PAID";
      console.log(`✓ Added ${badge} model: ${model.model} (${model.provider})`);
    } catch (error) {
      console.error(`✗ Error adding ${model.model}:`, error);
    }
  }

  console.log("\n✅ Model categories seeded successfully!");
  console.log("\n📊 Summary:");
  console.log(`   🆓 Free models: ${freeModels.filter(m => m.category === "free").length}`);
  console.log(`   💳 Paid models: ${freeModels.filter(m => m.category === "paid").length}`);
  console.log(`   💎 Premium models: ${freeModels.filter(m => m.category === "premium").length}`);
}

seedFreeModels()
  .then(() => {
    console.log("\n✅ Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  });
