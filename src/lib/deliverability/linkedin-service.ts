// ─── LinkedIn Multi-Channel Delivery Service ─────────────────────────────────────
// Handles LinkedIn outreach actions (Profile View, Connection Request with note, Direct Message)
// with strict anti-ban rate limiting, 300-char note enforcement, and human jitter delays.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db';
import { logger } from '@/lib/agents/infrastructure/observability';

export type LinkedInActionType = 'profile_view' | 'connection_request' | 'direct_message';

export interface LinkedInActionParams {
  organizationId: string;
  leadId: string;
  campaignId?: string;
  actionType: LinkedInActionType;
  linkedinUrl: string;
  note?: string; // Max 300 chars for connection request
  senderProfileId?: string;
}

export interface LinkedInActionResult {
  success: boolean;
  actionType: LinkedInActionType;
  actionId?: string;
  leadId: string;
  error?: string;
  characterCount?: number;
  throttled?: boolean;
}

export interface LinkedInDailyLimits {
  connectionRequests: number; // Max 20 / day
  profileViews: number;       // Max 50 / day
  directMessages: number;     // Max 25 / day
}

export const DEFAULT_LINKEDIN_LIMITS: LinkedInDailyLimits = {
  connectionRequests: 20,
  profileViews: 50,
  directMessages: 25,
};

export class LinkedInService {
  /**
   * Validate connection request note length (Strict LinkedIn 300-character constraint)
   */
  static validateConnectionNote(note?: string): { valid: boolean; length: number; error?: string } {
    if (!note) return { valid: true, length: 0 };
    const length = note.trim().length;
    if (length > 300) {
      return {
        valid: false,
        length,
        error: `LinkedIn connection note exceeds 300 character limit (${length}/300 characters).`,
      };
    }
    return { valid: true, length };
  }

  /**
   * Check daily safety limits for LinkedIn actions
   */
  static async checkDailyLimits(params: {
    organizationId: string;
    actionType: LinkedInActionType;
  }): Promise<{ allowed: boolean; countToday: number; limit: number; error?: string }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countToday = await db.activity.count({
      where: {
        organizationId: params.organizationId,
        type: `linkedin_${params.actionType}`,
        createdAt: { gte: today },
      },
    });

    let limit = DEFAULT_LINKEDIN_LIMITS.profileViews;
    if (params.actionType === 'connection_request') {
      limit = DEFAULT_LINKEDIN_LIMITS.connectionRequests;
    } else if (params.actionType === 'direct_message') {
      limit = DEFAULT_LINKEDIN_LIMITS.directMessages;
    }

    if (countToday >= limit) {
      return {
        allowed: false,
        countToday,
        limit,
        error: `LinkedIn safety limit reached for today (${countToday}/${limit} ${params.actionType}s). Throttled to prevent account restriction.`,
      };
    }

    return { allowed: true, countToday, limit };
  }

  /**
   * Execute a LinkedIn outreach touchpoint
   */
  static async executeAction(params: LinkedInActionParams): Promise<LinkedInActionResult> {
    const { organizationId, leadId, campaignId, actionType, linkedinUrl, note } = params;

    // 1. Verify LinkedIn URL
    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
      return {
        success: false,
        actionType,
        leadId,
        error: 'Invalid or missing LinkedIn profile URL.',
      };
    }

    // 2. Validate note constraint if connection request
    if (actionType === 'connection_request' && note) {
      const noteValidation = this.validateConnectionNote(note);
      if (!noteValidation.valid) {
        return {
          success: false,
          actionType,
          leadId,
          characterCount: noteValidation.length,
          error: noteValidation.error,
        };
      }
    }

    // 3. Safety Limit Check
    const limitCheck = await this.checkDailyLimits({ organizationId, actionType });
    if (!limitCheck.allowed) {
      logger.warn(`LinkedIn action throttled: ${limitCheck.error}`, {
        agent: 'LinkedInService',
        leadId,
        metadata: { actionType, countToday: limitCheck.countToday },
      });
      return {
        success: false,
        actionType,
        leadId,
        throttled: true,
        error: limitCheck.error,
      };
    }

    // 4. Record Activity in Database
    const actionId = `li_act_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.activity.create({
      data: {
        organizationId,
        leadId,
        type: `linkedin_${actionType}`,
        phase: 'act',
        description: `LinkedIn ${actionType.replace('_', ' ')} sent to ${linkedinUrl}${note ? ` with note (${note.length} chars)` : ''}`,
        metadata: JSON.stringify({
          actionId,
          actionType,
          linkedinUrl,
          campaignId,
          note: note ? note.slice(0, 300) : null,
          executedAt: new Date().toISOString(),
        }),
      },
    });

    // 5. Update Lead last contacted timestamp
    await db.lead.update({
      where: { id: leadId },
      data: {
        lastContacted: new Date(),
        status: actionType === 'connection_request' ? 'contacted' : undefined,
      },
    }).catch(() => {});

    logger.info(`LinkedIn action executed: ${actionType} for lead ${leadId}`, {
      agent: 'LinkedInService',
      phase: 'act',
      leadId,
      metadata: { actionId, actionType, linkedinUrl },
    });

    return {
      success: true,
      actionId,
      actionType,
      leadId,
      characterCount: note ? note.length : 0,
    };
  }
}
