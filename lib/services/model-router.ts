import type { AIProvider } from "@/lib/providers/types";
import { getProvider } from "@/lib/providers";
import { modelCategoriesRepository, organizationsRepository } from "@/db/repositories";
import { freeModelRateLimiter } from "./free-model-rate-limiter";
import type { Organization } from "@/db/schemas/organizations";
import { logger } from "@/lib/utils/logger";
import type { RateLimitResult } from "./free-model-rate-limiter";

export interface ModelRoutingResult {
  provider: AIProvider;
  shouldChargeCredits: boolean;
  rateLimitCheck: RateLimitResult;
  modelCategory?: {
    id: string;
    category: string;
    provider: string;
  };
}

export class ModelRouterService {
  async routeRequest(params: {
    organizationId: string;
    userId: string;
    model: string;
    requestType: "chat" | "embeddings";
  }): Promise<ModelRoutingResult> {
    logger.debug("[ModelRouter] Routing request", params);

    const org = await organizationsRepository.findById(params.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const modelCategory = await modelCategoriesRepository.findByModel(
      params.model
    );

    if (
      modelCategory &&
      modelCategory.category === "free" &&
      this.isEligibleForFree(org)
    ) {
      const rateLimitCheck = await freeModelRateLimiter.checkLimit({
        userId: params.userId,
        organizationId: params.organizationId,
        model: params.model,
        provider: modelCategory.provider,
      });

      if (!rateLimitCheck.allowed) {
        logger.info("[ModelRouter] Free tier rate limit exceeded", {
          userId: params.userId,
          model: params.model,
          reason: rateLimitCheck.reason,
        });

        return {
          provider: getProvider(),
          shouldChargeCredits: false,
          rateLimitCheck,
          modelCategory: {
            id: modelCategory.id,
            category: modelCategory.category,
            provider: modelCategory.provider,
          },
        };
      }

      logger.info("[ModelRouter] Using free tier model via Gateway", {
        model: params.model,
        provider: modelCategory.provider,
      });

      return {
        provider: getProvider(),
        shouldChargeCredits: false,
        rateLimitCheck,
        modelCategory: {
          id: modelCategory.id,
          category: modelCategory.category,
          provider: modelCategory.provider,
        },
      };
    }

    return {
      provider: getProvider(),
      shouldChargeCredits: true,
      rateLimitCheck: { allowed: true },
      modelCategory: modelCategory
        ? {
            id: modelCategory.id,
            category: modelCategory.category,
            provider: modelCategory.provider,
          }
        : undefined,
    };
  }

  private isEligibleForFree(org: Organization): boolean {
    if (!org.is_active) {
      return false;
    }

    return true;
  }

  async trackFreeModelUsage(params: {
    organizationId: string;
    userId: string;
    model: string;
    provider: string;
    tokenCount?: number;
  }): Promise<void> {
    await freeModelRateLimiter.trackUsage({
      ...params,
      requestCount: 1,
    });
  }
}

export const modelRouter = new ModelRouterService();
