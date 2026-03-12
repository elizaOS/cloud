/**
 * Users service for managing user accounts and organization relationships.
 */

import {
  usersRepository,
  organizationsRepository,
  type User,
  type NewUser,
  type UserWithOrganization,
} from "@/db/repositories";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

/**
 * Service for user operations including organization lookups.
 */
export class UsersService {
  async invalidateCache(user: User | UserWithOrganization): Promise<void> {
    const promises: Promise<void>[] = [
      cache.del(CacheKeys.user.byId(user.id)),
      cache.del(CacheKeys.user.withOrg(user.id)),
    ];
    if (user.email) {
      promises.push(cache.del(CacheKeys.user.byEmail(user.email)));
      promises.push(cache.del(CacheKeys.user.byEmailWithOrg(user.email)));
    }
    const privyUserId = user.privy_user_id;
    if (typeof privyUserId === "string") {
      promises.push(cache.del(CacheKeys.user.byPrivyId(privyUserId)));
      promises.push(cache.del(CacheKeys.user.byPrivyIdWithOrg(privyUserId)));
    }
    const walletAddress = user.wallet_address;
    if (typeof walletAddress === "string") {
      promises.push(cache.del(CacheKeys.user.byWalletAddress(walletAddress)));
      promises.push(cache.del(CacheKeys.user.byWalletAddressWithOrg(walletAddress)));
    }
    await Promise.all(promises);
    logger.debug("[UsersService] Invalidated cache for user:", user.id);
  }

  async getById(id: string): Promise<User | undefined> {
    const cacheKey = CacheKeys.user.byId(id);
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byId:", id);
      return cached;
    }
    const user = await usersRepository.findById(id);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byId);
      logger.debug("[UsersService] Cached user data:", id);
    }
    return user;
  }

  async getByEmail(email: string): Promise<User | undefined> {
    const cacheKey = CacheKeys.user.byEmail(email);
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byEmail");
      return cached;
    }
    const user = await usersRepository.findByEmail(email);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byEmail);
      logger.debug("[UsersService] Cached user data by email");
    }
    return user;
  }

  async getByPrivyId(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const cacheKey = CacheKeys.user.byPrivyId(privyUserId);
    const cached = await cache.get<UserWithOrganization>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byPrivyId");
      return cached;
    }
    const user = await usersRepository.findByPrivyIdWithOrganization(privyUserId);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byPrivyId);
      logger.debug("[UsersService] Cached user data by privyId");
    }
    return user;
  }

  async getByPrivyIdForWrite(
    privyUserId: string,
  ): Promise<UserWithOrganization | undefined> {
    const user = await usersRepository.findByPrivyIdWithOrganizationForWrite(
      privyUserId,
    );
    if (user) {
      await Promise.all([
        cache.set(CacheKeys.user.byPrivyId(privyUserId), user, CacheTTL.user.byPrivyId),
        cache.set(
          CacheKeys.user.byPrivyIdWithOrg(privyUserId),
          user,
          CacheTTL.user.byPrivyIdWithOrg,
        ),
      ]);
      logger.debug("[UsersService] Cached user data by privyId from primary");
    }
    return user;
  }

  async getPrivyIdentityForWrite(
    privyUserId: string,
  ): Promise<{ user_id: string; privy_user_id: string | null } | undefined> {
    return await usersRepository.findIdentityByPrivyIdForWrite(privyUserId);
  }

  async getWithOrganization(
    userId: string,
  ): Promise<UserWithOrganization | undefined> {
    const cacheKey = CacheKeys.user.withOrg(userId);
    const cached = await cache.get<UserWithOrganization>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user withOrg:", userId);
      return cached;
    }
    const user = await usersRepository.findWithOrganization(userId);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.withOrg);
      logger.debug("[UsersService] Cached user withOrg data:", userId);
    }
    return user;
  }

  async getByEmailWithOrganization(
    email: string,
  ): Promise<UserWithOrganization | undefined> {
    const cacheKey = CacheKeys.user.byEmailWithOrg(email);
    const cached = await cache.get<UserWithOrganization>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byEmailWithOrg");
      return cached;
    }
    const user = await usersRepository.findByEmailWithOrganization(email);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byEmailWithOrg);
      logger.debug("[UsersService] Cached user data byEmailWithOrg");
    }
    return user;
  }

  async getByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const cacheKey = CacheKeys.user.byWalletAddress(walletAddress);
    const cached = await cache.get<User>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byWalletAddress");
      return cached;
    }
    const user = await usersRepository.findByWalletAddress(walletAddress);
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byWalletAddress);
      logger.debug("[UsersService] Cached user data byWalletAddress");
    }
    return user;
  }

  async getByWalletAddressWithOrganization(
    walletAddress: string,
  ): Promise<UserWithOrganization | undefined> {
    const cacheKey = CacheKeys.user.byWalletAddressWithOrg(walletAddress);
    const cached = await cache.get<UserWithOrganization>(cacheKey);
    if (cached) {
      logger.debug("[UsersService] Cache hit for user byWalletAddressWithOrg");
      return cached;
    }
    const user = await usersRepository.findByWalletAddressWithOrganization(
      walletAddress,
    );
    if (user) {
      await cache.set(cacheKey, user, CacheTTL.user.byWalletAddressWithOrg);
      logger.debug("[UsersService] Cached user data byWalletAddressWithOrg");
    }
    return user;
  }

  async listByOrganization(organizationId: string): Promise<User[]> {
    return await usersRepository.listByOrganization(organizationId);
  }

  async create(data: NewUser): Promise<User> {
    return await usersRepository.create(data);
  }

  async update(id: string, data: Partial<NewUser>): Promise<User | undefined> {
    const existing = await usersRepository.findById(id);
    const result = await usersRepository.update(id, data);
    if (existing) {
      await this.invalidateCache(existing);
    }
    if (result) {
      await this.invalidateCache(result);
    }
    return result;
  }

  async upsertPrivyIdentity(
    userId: string,
    privyUserId: string,
  ): Promise<void> {
    const existingIdentity =
      await usersRepository.findIdentityByUserIdForWrite(userId);

    await usersRepository.upsertPrivyIdentity(userId, privyUserId);

    const cacheDeletes = [
      cache.del(CacheKeys.user.byPrivyId(privyUserId)),
      cache.del(CacheKeys.user.byPrivyIdWithOrg(privyUserId)),
    ];

    if (
      existingIdentity?.privy_user_id &&
      existingIdentity.privy_user_id !== privyUserId
    ) {
      cacheDeletes.push(
        cache.del(CacheKeys.user.byPrivyId(existingIdentity.privy_user_id)),
        cache.del(
          CacheKeys.user.byPrivyIdWithOrg(existingIdentity.privy_user_id),
        ),
      );
    }

    await Promise.all(cacheDeletes);
  }

  async delete(id: string): Promise<void> {
    const user = await this.getById(id);

    if (!user) {
      throw new Error(`User ${id} not found`);
    }

    const organizationId = user.organization_id;

    await this.invalidateCache(user);
    await usersRepository.delete(id);

    // Check if this was the last user in the organization
    if (organizationId) {
      const remainingUsers =
        await usersRepository.listByOrganization(organizationId);

      // If no users remain, delete the organization
      if (remainingUsers.length === 0) {
        await organizationsRepository.delete(organizationId);
      }
    }
  }
}

// Export singleton instance
export const usersService = new UsersService();
