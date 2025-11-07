import { userSessionsRepository } from "@/db/repositories";
import type { UserSession, NewUserSession } from "@/db/schemas/user-sessions";

export interface CreateSessionParams {
  user_id: string;
  organization_id: string;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  device_info?: Record<string, unknown>;
}

export interface TrackUsageParams {
  session_token: string;
  credits_used?: number;
  requests_made?: number;
  tokens_consumed?: number;
}

class UserSessionsService {
  async getById(id: string): Promise<UserSession | undefined> {
    return await userSessionsRepository.findById(id);
  }

  async getActiveByToken(
    sessionToken: string,
  ): Promise<UserSession | undefined> {
    return await userSessionsRepository.findActiveByToken(sessionToken);
  }

  async listActiveByUser(userId: string): Promise<UserSession[]> {
    return await userSessionsRepository.listActiveByUser(userId);
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<UserSession[]> {
    return await userSessionsRepository.listByOrganization(
      organizationId,
      limit,
    );
  }

  async create(params: CreateSessionParams): Promise<UserSession> {
    const sessionData: NewUserSession = {
      user_id: params.user_id,
      organization_id: params.organization_id,
      session_token: params.session_token,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      device_info: params.device_info || {},
      credits_used: "0.00",
      requests_made: 0,
      tokens_consumed: 0,
      started_at: new Date(),
      last_activity_at: new Date(),
    };

    return await userSessionsRepository.create(sessionData);
  }

  async trackUsage(params: TrackUsageParams): Promise<UserSession | undefined> {
    const { session_token, credits_used, requests_made, tokens_consumed } =
      params;

    return await userSessionsRepository.incrementMetrics(session_token, {
      credits_used,
      requests_made,
      tokens_consumed,
    });
  }

  async endSession(sessionToken: string): Promise<UserSession | undefined> {
    return await userSessionsRepository.endSession(sessionToken);
  }

  async endAllUserSessions(userId: string): Promise<number> {
    return await userSessionsRepository.endAllUserSessions(userId);
  }

  async getCurrentSessionStats(userId: string): Promise<{
    credits_used: number;
    requests_made: number;
    tokens_consumed: number;
  } | null> {
    return await userSessionsRepository.getCurrentSessionStats(userId);
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    return await userSessionsRepository.cleanupOldSessions(daysOld);
  }

  async getOrCreateSession(params: {
    user_id: string;
    organization_id: string;
    session_token: string;
    ip_address?: string;
    user_agent?: string;
    device_info?: Record<string, unknown>;
  }): Promise<UserSession> {
    const existing = await this.getActiveByToken(params.session_token);

    if (existing) {
      return existing;
    }

    return await this.create(params);
  }
}

export const userSessionsService = new UserSessionsService();
