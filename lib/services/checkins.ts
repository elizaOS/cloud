/**
 * Check-ins Service
 *
 * Manages team check-in schedules, responses, and report generation.
 * Generic cloud capability for cross-platform team check-ins.
 */

import { and, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  orgCheckinSchedules,
  orgCheckinResponses,
  orgTeamMembers,
  orgPlatformServers,
  OrgCheckinSchedule,
  OrgCheckinResponse,
  OrgTeamMember,
  NewOrgCheckinSchedule,
  NewOrgCheckinResponse,
  NewOrgTeamMember,
} from "@/db/schemas/org-platforms";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type CheckinType =
  | "standup"
  | "sprint"
  | "mental_health"
  | "project_status"
  | "retrospective";

export type CheckinFrequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "bi_weekly"
  | "monthly";

export interface CreateScheduleParams {
  organizationId: string;
  serverId: string;
  name: string;
  checkinType?: CheckinType;
  frequency?: CheckinFrequency;
  timeUtc: string; // HH:MM
  timezone?: string;
  checkinChannelId: string;
  reportChannelId?: string;
  questions?: string[];
  createdBy?: string;
}

export interface UpdateScheduleParams {
  name?: string;
  checkinType?: CheckinType;
  frequency?: CheckinFrequency;
  timeUtc?: string;
  timezone?: string;
  checkinChannelId?: string;
  reportChannelId?: string;
  questions?: string[];
  enabled?: boolean;
}

export interface RecordResponseParams {
  scheduleId: string;
  organizationId: string;
  responderPlatformId: string;
  responderPlatform: "discord" | "telegram";
  responderName?: string;
  responderAvatar?: string;
  answers: Record<string, string>;
  sourceMessageId?: string;
  sourceChannelId?: string;
  checkinDate?: Date;
}

export interface TeamMemberParams {
  organizationId: string;
  serverId: string;
  platformUserId: string;
  platform: "discord" | "telegram";
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  role?: string;
  isAdmin?: boolean;
}

export interface TeamReport {
  scheduleId: string;
  scheduleName: string;
  checkinType: CheckinType;
  dateRange: { start: Date; end: Date };
  totalResponses: number;
  participationRate: number;
  members: Array<{
    id: string;
    name: string;
    avatar?: string;
    responseCount: number;
    lastResponse?: Date;
    streak: number;
    blockerCount: number;
  }>;
  blockers: Array<{
    memberId: string;
    memberName: string;
    blocker: string;
    date: Date;
  }>;
  summary?: string;
}

// =============================================================================
// DEFAULT QUESTIONS
// =============================================================================

const DEFAULT_QUESTIONS: Record<CheckinType, string[]> = {
  standup: [
    "What did you accomplish yesterday?",
    "What are you working on today?",
    "Any blockers or challenges?",
  ],
  sprint: [
    "What sprint tasks have you completed?",
    "What sprint tasks are in progress?",
    "Will you meet your sprint commitments?",
    "Any blockers affecting the sprint?",
  ],
  mental_health: [
    "How are you feeling today? (1-10)",
    "What's contributing to how you feel?",
    "Is there anything the team can help with?",
  ],
  project_status: [
    "What's the current status of your project tasks?",
    "What milestones have been reached?",
    "Are there any risks or concerns?",
    "What support do you need?",
  ],
  retrospective: [
    "What went well this period?",
    "What could be improved?",
    "What actions should we take going forward?",
  ],
};

// =============================================================================
// SERVICE CLASS
// =============================================================================

class CheckinsService {
  // ===========================================================================
  // SCHEDULES
  // ===========================================================================

  /**
   * Create a new check-in schedule
   */
  async createSchedule(params: CreateScheduleParams): Promise<OrgCheckinSchedule> {
    logger.info("[OrgCheckins] Creating schedule", {
      organizationId: params.organizationId,
      serverId: params.serverId,
      name: params.name,
    });

    const checkinType = params.checkinType || "standup";
    const questions = params.questions || DEFAULT_QUESTIONS[checkinType];

    // Calculate next run time
    const nextRunAt = this.calculateNextRun(
      params.timeUtc,
      params.frequency || "weekdays",
      params.timezone || "UTC"
    );

    const [schedule] = await db
      .insert(orgCheckinSchedules)
      .values({
        organization_id: params.organizationId,
        server_id: params.serverId,
        name: params.name,
        checkin_type: checkinType,
        frequency: params.frequency || "weekdays",
        time_utc: params.timeUtc,
        timezone: params.timezone || "UTC",
        checkin_channel_id: params.checkinChannelId,
        report_channel_id: params.reportChannelId,
        questions,
        next_run_at: nextRunAt,
        created_by: params.createdBy,
      })
      .returning();

    return schedule;
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(
    scheduleId: string,
    organizationId: string
  ): Promise<OrgCheckinSchedule | null> {
    const [schedule] = await db
      .select()
      .from(orgCheckinSchedules)
      .where(
        and(
          eq(orgCheckinSchedules.id, scheduleId),
          eq(orgCheckinSchedules.organization_id, organizationId)
        )
      )
      .limit(1);

    return schedule || null;
  }

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    organizationId: string,
    updates: UpdateScheduleParams
  ): Promise<OrgCheckinSchedule> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.checkinType !== undefined) updateData.checkin_type = updates.checkinType;
    if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
    if (updates.timeUtc !== undefined) updateData.time_utc = updates.timeUtc;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.checkinChannelId !== undefined)
      updateData.checkin_channel_id = updates.checkinChannelId;
    if (updates.reportChannelId !== undefined)
      updateData.report_channel_id = updates.reportChannelId;
    if (updates.questions !== undefined) updateData.questions = updates.questions;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

    // Recalculate next run if time/frequency changed
    if (updates.timeUtc || updates.frequency) {
      const current = await this.getSchedule(scheduleId, organizationId);
      if (current) {
        updateData.next_run_at = this.calculateNextRun(
          updates.timeUtc || current.time_utc,
          updates.frequency || current.frequency,
          updates.timezone || current.timezone || "UTC"
        );
      }
    }

    const [updated] = await db
      .update(orgCheckinSchedules)
      .set(updateData)
      .where(
        and(
          eq(orgCheckinSchedules.id, scheduleId),
          eq(orgCheckinSchedules.organization_id, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("Schedule not found");
    }

    return updated;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string, organizationId: string): Promise<void> {
    await db
      .delete(orgCheckinSchedules)
      .where(
        and(
          eq(orgCheckinSchedules.id, scheduleId),
          eq(orgCheckinSchedules.organization_id, organizationId)
        )
      );
  }

  /**
   * List schedules for an organization
   */
  async listSchedules(organizationId: string): Promise<OrgCheckinSchedule[]> {
    return db
      .select()
      .from(orgCheckinSchedules)
      .where(eq(orgCheckinSchedules.organization_id, organizationId))
      .orderBy(desc(orgCheckinSchedules.created_at));
  }

  /**
   * List schedules for a server
   */
  async listServerSchedules(serverId: string): Promise<OrgCheckinSchedule[]> {
    return db
      .select()
      .from(orgCheckinSchedules)
      .where(eq(orgCheckinSchedules.server_id, serverId))
      .orderBy(desc(orgCheckinSchedules.created_at));
  }

  /**
   * Get schedules due to run
   */
  async getDueSchedules(): Promise<OrgCheckinSchedule[]> {
    const now = new Date();

    return db
      .select()
      .from(orgCheckinSchedules)
      .where(
        and(
          eq(orgCheckinSchedules.enabled, true),
          lte(orgCheckinSchedules.next_run_at, now)
        )
      );
  }

  /**
   * Mark a schedule as run and calculate next run time
   */
  async markScheduleRun(scheduleId: string): Promise<void> {
    const [schedule] = await db
      .select()
      .from(orgCheckinSchedules)
      .where(eq(orgCheckinSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) return;

    const nextRunAt = this.calculateNextRun(
      schedule.time_utc,
      schedule.frequency,
      schedule.timezone || "UTC"
    );

    await db
      .update(orgCheckinSchedules)
      .set({
        last_run_at: new Date(),
        next_run_at: nextRunAt,
        updated_at: new Date(),
      })
      .where(eq(orgCheckinSchedules.id, scheduleId));
  }

  // ===========================================================================
  // RESPONSES
  // ===========================================================================

  /**
   * Record a check-in response
   */
  async recordResponse(params: RecordResponseParams): Promise<OrgCheckinResponse> {
    logger.info("[OrgCheckins] Recording response", {
      scheduleId: params.scheduleId,
      responder: params.responderPlatformId,
    });

    // Detect blockers in answers
    const blockers: string[] = [];
    const blockerKeywords = ["blocker", "blocked", "stuck", "issue", "problem", "help"];

    for (const [question, answer] of Object.entries(params.answers)) {
      const lowerAnswer = answer.toLowerCase();
      if (blockerKeywords.some((kw) => lowerAnswer.includes(kw))) {
        blockers.push(answer);
      }
    }

    const [response] = await db
      .insert(orgCheckinResponses)
      .values({
        schedule_id: params.scheduleId,
        organization_id: params.organizationId,
        responder_platform_id: params.responderPlatformId,
        responder_platform: params.responderPlatform,
        responder_name: params.responderName,
        responder_avatar: params.responderAvatar,
        answers: params.answers,
        blockers_detected: blockers.length > 0,
        blockers,
        source_message_id: params.sourceMessageId,
        source_channel_id: params.sourceChannelId,
        checkin_date: params.checkinDate || new Date(),
      })
      .returning();

    // Update team member stats
    await this.updateMemberCheckinStats(
      params.organizationId,
      params.responderPlatformId,
      params.responderPlatform
    );

    return response;
  }

  /**
   * Get responses for a schedule
   */
  async getResponses(
    scheduleId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<OrgCheckinResponse[]> {
    const conditions = [eq(orgCheckinResponses.schedule_id, scheduleId)];

    if (options?.startDate) {
      conditions.push(gte(orgCheckinResponses.checkin_date, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(orgCheckinResponses.checkin_date, options.endDate));
    }

    let query = db
      .select()
      .from(orgCheckinResponses)
      .where(and(...conditions))
      .orderBy(desc(orgCheckinResponses.submitted_at));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    return query;
  }

  /**
   * Get responses for a specific member
   */
  async getMemberResponses(
    organizationId: string,
    platformId: string,
    platform: "discord" | "telegram",
    limit = 30
  ): Promise<OrgCheckinResponse[]> {
    return db
      .select()
      .from(orgCheckinResponses)
      .where(
        and(
          eq(orgCheckinResponses.organization_id, organizationId),
          eq(orgCheckinResponses.responder_platform_id, platformId),
          eq(orgCheckinResponses.responder_platform, platform)
        )
      )
      .orderBy(desc(orgCheckinResponses.submitted_at))
      .limit(limit);
  }

  // ===========================================================================
  // TEAM MEMBERS
  // ===========================================================================

  /**
   * Add or update a team member
   */
  async upsertTeamMember(params: TeamMemberParams): Promise<OrgTeamMember> {
    const existing = await db
      .select()
      .from(orgTeamMembers)
      .where(
        and(
          eq(orgTeamMembers.server_id, params.serverId),
          eq(orgTeamMembers.platform_user_id, params.platformUserId),
          eq(orgTeamMembers.platform, params.platform)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(orgTeamMembers)
        .set({
          display_name: params.displayName,
          username: params.username,
          avatar_url: params.avatarUrl,
          role: params.role,
          is_admin: params.isAdmin,
          updated_at: new Date(),
        })
        .where(eq(orgTeamMembers.id, existing[0].id))
        .returning();

      return updated;
    }

    const [member] = await db
      .insert(orgTeamMembers)
      .values({
        organization_id: params.organizationId,
        server_id: params.serverId,
        platform_user_id: params.platformUserId,
        platform: params.platform,
        display_name: params.displayName,
        username: params.username,
        avatar_url: params.avatarUrl,
        role: params.role,
        is_admin: params.isAdmin,
      })
      .returning();

    return member;
  }

  /**
   * Get team members for a server
   */
  async getTeamMembers(serverId: string): Promise<OrgTeamMember[]> {
    return db
      .select()
      .from(orgTeamMembers)
      .where(
        and(
          eq(orgTeamMembers.server_id, serverId),
          eq(orgTeamMembers.is_active, true)
        )
      )
      .orderBy(orgTeamMembers.display_name);
  }

  /**
   * Update a team member
   */
  async updateTeamMember(
    memberId: string,
    organizationId: string,
    updates: Partial<NewOrgTeamMember>
  ): Promise<OrgTeamMember> {
    const [updated] = await db
      .update(orgTeamMembers)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgTeamMembers.id, memberId),
          eq(orgTeamMembers.organization_id, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("Team member not found");
    }

    return updated;
  }

  /**
   * Update member check-in stats
   */
  private async updateMemberCheckinStats(
    organizationId: string,
    platformId: string,
    platform: "discord" | "telegram"
  ): Promise<void> {
    await db
      .update(orgTeamMembers)
      .set({
        total_checkins: sql`${orgTeamMembers.total_checkins}::int + 1`,
        last_checkin_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgTeamMembers.organization_id, organizationId),
          eq(orgTeamMembers.platform_user_id, platformId),
          eq(orgTeamMembers.platform, platform)
        )
      );
  }

  // ===========================================================================
  // REPORTS
  // ===========================================================================

  /**
   * Generate a team report for a schedule
   */
  async generateReport(
    scheduleId: string,
    organizationId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<TeamReport> {
    const schedule = await this.getSchedule(scheduleId, organizationId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Get all responses in date range
    const responses = await this.getResponses(scheduleId, {
      startDate: dateRange.start,
      endDate: dateRange.end,
    });

    // Get server team members
    const [server] = await db
      .select()
      .from(orgPlatformServers)
      .where(eq(orgPlatformServers.id, schedule.server_id))
      .limit(1);

    const teamMembers = server
      ? await this.getTeamMembers(schedule.server_id)
      : [];

    // Aggregate by member
    const memberMap = new Map<
      string,
      {
        id: string;
        name: string;
        avatar?: string;
        responses: OrgCheckinResponse[];
      }
    >();

    for (const response of responses) {
      const key = `${response.responder_platform}-${response.responder_platform_id}`;
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          id: response.responder_platform_id,
          name: response.responder_name || "Unknown",
          avatar: response.responder_avatar || undefined,
          responses: [],
        });
      }
      memberMap.get(key)!.responses.push(response);
    }

    // Calculate member stats
    const members = Array.from(memberMap.values()).map((m) => {
      const blockerCount = m.responses.filter((r) => r.blockers_detected).length;
      const lastResponse = m.responses[0]?.submitted_at;

      // Calculate streak (simplified - consecutive days)
      let streak = 0;
      const sortedResponses = [...m.responses].sort(
        (a, b) =>
          new Date(b.checkin_date).getTime() - new Date(a.checkin_date).getTime()
      );

      if (sortedResponses.length > 0) {
        streak = 1;
        for (let i = 1; i < sortedResponses.length; i++) {
          const prev = new Date(sortedResponses[i - 1].checkin_date);
          const curr = new Date(sortedResponses[i].checkin_date);
          const diffDays = Math.floor(
            (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays <= 1) {
            streak++;
          } else {
            break;
          }
        }
      }

      return {
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        responseCount: m.responses.length,
        lastResponse,
        streak,
        blockerCount,
      };
    });

    // Collect all blockers
    const blockers: TeamReport["blockers"] = [];
    for (const response of responses) {
      if (response.blockers_detected && response.blockers) {
        for (const blocker of response.blockers) {
          blockers.push({
            memberId: response.responder_platform_id,
            memberName: response.responder_name || "Unknown",
            blocker,
            date: new Date(response.checkin_date),
          });
        }
      }
    }

    // Calculate participation rate
    const totalPossibleResponses =
      teamMembers.length * this.getWorkdaysInRange(dateRange.start, dateRange.end);
    const participationRate =
      totalPossibleResponses > 0
        ? (responses.length / totalPossibleResponses) * 100
        : 0;

    return {
      scheduleId,
      scheduleName: schedule.name,
      checkinType: schedule.checkin_type,
      dateRange,
      totalResponses: responses.length,
      participationRate: Math.round(participationRate * 100) / 100,
      members,
      blockers,
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Calculate the next run time for a schedule
   */
  private calculateNextRun(
    timeUtc: string,
    frequency: CheckinFrequency,
    _timezone: string
  ): Date {
    const [hours, minutes] = timeUtc.split(":").map(Number);
    const now = new Date();
    const next = new Date(now);

    next.setUTCHours(hours, minutes, 0, 0);

    // If the time has passed today, start from tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Adjust based on frequency
    switch (frequency) {
      case "weekdays":
        while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
          next.setDate(next.getDate() + 1);
        }
        break;
      case "weekly":
        // Next Monday
        while (next.getUTCDay() !== 1) {
          next.setDate(next.getDate() + 1);
        }
        break;
      case "bi_weekly":
        // Next Monday, then skip a week
        while (next.getUTCDay() !== 1) {
          next.setDate(next.getDate() + 1);
        }
        // Check if we should skip this week (simplified logic)
        const weekNumber = Math.floor(next.getTime() / (7 * 24 * 60 * 60 * 1000));
        if (weekNumber % 2 === 1) {
          next.setDate(next.getDate() + 7);
        }
        break;
      case "monthly":
        // First day of next month
        next.setMonth(next.getMonth() + 1, 1);
        break;
      // daily - no adjustment needed
    }

    return next;
  }

  /**
   * Count workdays in a date range
   */
  private getWorkdaysInRange(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);

    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const checkinsService = new CheckinsService();

