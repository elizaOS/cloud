import crypto from "crypto";
import {
  apiKeysRepository,
  type ApiKey,
  type NewApiKey,
} from "@/db/repositories";
import { API_KEY_PREFIX_LENGTH } from "@/lib/pricing";

export interface GeneratedApiKey {
  key: string;
  hash: string;
  prefix: string;
}

export class ApiKeysService {
  generateApiKey(): GeneratedApiKey {
    const randomBytes = crypto.randomBytes(32).toString("hex");
    const key = `eliza_${randomBytes}`;
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);

    return { key, hash, prefix };
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const apiKey = await apiKeysRepository.findActiveByHash(hash);
    return apiKey || null;
  }

  async getById(id: string): Promise<ApiKey | undefined> {
    return await apiKeysRepository.findById(id);
  }

  async listByOrganization(organizationId: string): Promise<ApiKey[]> {
    return await apiKeysRepository.listByOrganization(organizationId);
  }

  async create(
    data: Omit<NewApiKey, "key" | "key_hash" | "key_prefix">,
  ): Promise<{
    apiKey: ApiKey;
    plainKey: string;
  }> {
    const { key, hash, prefix } = this.generateApiKey();

    const apiKey = await apiKeysRepository.create({
      ...data,
      key,
      key_hash: hash,
      key_prefix: prefix,
    });

    return {
      apiKey,
      plainKey: key,
    };
  }

  async update(
    id: string,
    data: Partial<NewApiKey>,
  ): Promise<ApiKey | undefined> {
    return await apiKeysRepository.update(id, data);
  }

  async incrementUsage(id: string): Promise<void> {
    await apiKeysRepository.incrementUsage(id);
  }

  async delete(id: string): Promise<void> {
    await apiKeysRepository.delete(id);
  }
}

// Export singleton instance
export const apiKeysService = new ApiKeysService();
