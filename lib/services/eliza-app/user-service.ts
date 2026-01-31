/**
 * Eliza App User Service
 *
 * Manages user accounts for Eliza App authentication via Telegram and phone (iMessage).
 * Auto-creates organizations for new users with initial credit balance.
 */

import { usersRepository, type UserWithOrganization } from "@/db/repositories/users";
import { organizationsRepository } from "@/db/repositories/organizations";
import { creditsService } from "@/lib/services/credits";
import { apiKeysService } from "@/lib/services/api-keys";
import { logger } from "@/lib/utils/logger";
import { normalizePhoneNumber } from "@/lib/utils/phone-normalization";
import type { TelegramAuthData } from "./telegram-auth";
import type { User, NewUser } from "@/db/schemas/users";
import type { Organization } from "@/db/schemas/organizations";

const ELIZA_APP_INITIAL_CREDITS = 1.0;

export interface FindOrCreateResult {
  user: User;
  organization: Organization;
  isNew: boolean;
}

function generateSlugFromTelegram(username?: string, telegramId?: string): string {
  const base = username ? username.toLowerCase().replace(/[^a-z0-9]/g, "-") : `tg-${telegramId}`;
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `${base}-${timestamp}${random}`;
}

function generateSlugFromPhone(phoneNumber: string): string {
  const lastFour = phoneNumber.replace(/\D/g, "").slice(-4);
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `phone-${lastFour}-${timestamp}${random}`;
}

async function ensureUniqueSlug(
  generateFn: () => string,
  maxAttempts = 10,
): Promise<string> {
  let slug = generateFn();
  let attempts = 0;

  while (await organizationsRepository.findBySlug(slug)) {
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique organization slug");
    }
    slug = generateFn();
  }

  return slug;
}

async function createUserWithOrganization(params: {
  userData: Omit<NewUser, "organization_id">;
  organizationName: string;
  slugGenerator: () => string;
}): Promise<FindOrCreateResult> {
  const { userData, organizationName, slugGenerator } = params;
  const slug = await ensureUniqueSlug(slugGenerator);

  const organization = await organizationsRepository.create({
    name: organizationName,
    slug,
    credit_balance: "0.00",
  });

  if (ELIZA_APP_INITIAL_CREDITS > 0) {
    await creditsService.addCredits({
      organizationId: organization.id,
      amount: ELIZA_APP_INITIAL_CREDITS,
      description: "Eliza App - Welcome bonus",
      metadata: { type: "initial_free_credits", source: "eliza-app-signup" },
    });
  }

  const user = await usersRepository.create({
    ...userData,
    organization_id: organization.id,
    role: "owner",
    is_active: true,
  });

  await apiKeysService.create({
    user_id: user.id,
    organization_id: organization.id,
    name: "Eliza App Default Key",
    is_active: true,
  });

  logger.info("[ElizaAppUserService] Created new user and organization", {
    userId: user.id,
    organizationId: organization.id,
    telegramId: user.telegram_id,
    phoneNumber: user.phone_number,
  });

  return { user, organization, isNew: true };
}

class ElizaAppUserService {
  async findOrCreateByTelegram(telegramData: TelegramAuthData): Promise<FindOrCreateResult> {
    const telegramId = String(telegramData.id);
    const existingUser = await usersRepository.findByTelegramIdWithOrganization(telegramId);

    if (existingUser && existingUser.organization) {
      const shouldUpdate =
        existingUser.telegram_username !== telegramData.username ||
        existingUser.telegram_first_name !== telegramData.first_name ||
        existingUser.telegram_photo_url !== telegramData.photo_url;

      if (shouldUpdate) {
        await usersRepository.update(existingUser.id, {
          telegram_username: telegramData.username || existingUser.telegram_username,
          telegram_first_name: telegramData.first_name,
          telegram_photo_url: telegramData.photo_url || existingUser.telegram_photo_url,
          updated_at: new Date(),
        });
      }

      logger.info("[ElizaAppUserService] Found existing Telegram user", {
        userId: existingUser.id,
        telegramId,
        updated: shouldUpdate,
      });

      return {
        user: existingUser,
        organization: existingUser.organization,
        isNew: false,
      };
    }

    const displayName = telegramData.last_name
      ? `${telegramData.first_name} ${telegramData.last_name}`
      : telegramData.first_name;

    const organizationName = telegramData.username
      ? `${telegramData.username}'s Workspace`
      : `${telegramData.first_name}'s Workspace`;

    return createUserWithOrganization({
      userData: {
        telegram_id: telegramId,
        telegram_username: telegramData.username,
        telegram_first_name: telegramData.first_name,
        telegram_photo_url: telegramData.photo_url,
        name: displayName,
        is_anonymous: false,
      },
      organizationName,
      slugGenerator: () => generateSlugFromTelegram(telegramData.username, telegramId),
    });
  }

  async findOrCreateByPhone(phoneNumber: string): Promise<FindOrCreateResult> {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const existingUser = await usersRepository.findByPhoneNumberWithOrganization(normalizedPhone);

    if (existingUser && existingUser.organization) {
      return { user: existingUser, organization: existingUser.organization, isNew: false };
    }

    const lastFour = normalizedPhone.slice(-4);
    const displayName = `User ***${lastFour}`;
    const organizationName = `User ***${lastFour}'s Workspace`;

    return createUserWithOrganization({
      userData: {
        phone_number: normalizedPhone,
        phone_verified: true, // Phone verified by virtue of being able to send iMessage
        name: displayName,
        is_anonymous: false,
      },
      organizationName,
      slugGenerator: () => generateSlugFromPhone(normalizedPhone),
    });
  }

  async getById(userId: string): Promise<UserWithOrganization | undefined> {
    return usersRepository.findWithOrganization(userId);
  }

  async getByTelegramId(telegramId: string): Promise<UserWithOrganization | undefined> {
    return usersRepository.findByTelegramIdWithOrganization(telegramId);
  }

  async getByPhoneNumber(phoneNumber: string): Promise<UserWithOrganization | undefined> {
    return usersRepository.findByPhoneNumberWithOrganization(normalizePhoneNumber(phoneNumber));
  }

  async updateUser(userId: string, data: Partial<NewUser>): Promise<User | undefined> {
    return usersRepository.update(userId, {
      ...data,
      updated_at: new Date(),
    });
  }
}

export const elizaAppUserService = new ElizaAppUserService();
