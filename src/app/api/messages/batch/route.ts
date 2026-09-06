import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, fail, handleApiError, ok } from '@/lib/api/responses';
import { orchestrator } from '@/lib/orchestrator';
import { evaluateSendReadiness } from '@/lib/deliverability/send-readiness';
import { AgentMemoryService } from '@/lib/agents/infrastructure/agent-memory';
import { isLeadSafeToContact } from '@/lib/safety';

const BatchActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'regenerate', 'bulk_approve']),
  messageIds: z.array(z.string().min(1)).min(1),
  feedback: z.string().optional(),
  organizationId: z.string().optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  deliverabilityCheck: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);
    const orgId = context.organizationId;
    const body = await request.json();
    const parsed = BatchActionSchema.safeParse(body);

    if (!parsed.success) {
      return fail('Invalid batch action payload', 400, 'validation_error', traceId);
    }

    const { action, messageIds, feedback, minConfidence, deliverabilityCheck } = parsed.data;

    // Fetch candidate messages scoped to workspace
    const messages = await db.outreachMessage.findMany({
      where: {
        id: { in: messageIds },
        organizationId: orgId,
      },
      include: {
        lead: true,
        campaign: true,
      },
    });

    if (messages.length === 0) {
      return fail('No matching messages found for current workspace', 404, 'not_found', traceId);
    }

    const statuses: Record<string, string> = {};
    const safetyResults: Record<string, { ready: boolean; reason?: string; checks?: any[] }> = {};
    let processedCount = 0;
    let memoryUpdated = false;

    if (action === 'approve') {
      for (const msg of messages) {
        try {
          const safety = await isLeadSafeToContact(msg.leadId, orgId);
          if (!safety.safe) {
            statuses[msg.id] = 'blocked';
            safetyResults[msg.id] = {
              ready: false,
              reason: `Lead safety check failed: ${safety.reasons.join(', ')}`,
            };
            continue;
          }

          const result = await orchestrator.approveMessage(msg.id, undefined, undefined, orgId);
          if (result.success) {
            statuses[msg.id] = 'approved';
            processedCount++;

            if (feedback && feedback.trim()) {
              await AgentMemoryService.recordFeedback({
                organizationId: orgId,
                category: 'human_feedback',
                key: `approval_note_${msg.strategy || 'default'}_${msg.lead?.title || 'lead'}`,
                wasSuccessful: true,
                industry: msg.lead?.company || undefined,
                persona: msg.lead?.title || undefined,
                channel: msg.channel,
              });
              memoryUpdated = true;
            }
          } else {
            statuses[msg.id] = 'failed';
          }
        } catch (err: any) {
          statuses[msg.id] = 'error';
        }
      }
    } else if (action === 'reject') {
      for (const msg of messages) {
        try {
          await db.outreachMessage.updateMany({
            where: { id: msg.id, organizationId: orgId },
            data: { status: 'rejected' },
          });

          await db.lead.updateMany({
            where: { id: msg.leadId, organizationId: orgId },
            data: { status: 'rejected' },
          });

          statuses[msg.id] = 'rejected';
          processedCount++;

          // Record negative signal into agent memory
          await AgentMemoryService.recordFeedback({
            organizationId: orgId,
            category: 'pitch_rejection',
            key: `rejection_${msg.strategy || 'strategy'}_${msg.angle || 'angle'}_${msg.lead?.title || 'lead'}`,
            wasSuccessful: false,
            industry: msg.lead?.company || undefined,
            persona: msg.lead?.title || undefined,
            channel: msg.channel,
          });

          if (feedback && feedback.trim()) {
            await AgentMemoryService.recordFeedback({
              organizationId: orgId,
              category: 'rejection_reason',
              key: `reason_${msg.strategy || 'default'}_${feedback.slice(0, 30).replace(/\s+/g, '_')}`,
              wasSuccessful: false,
              industry: msg.lead?.company || undefined,
              persona: msg.lead?.title || undefined,
              channel: msg.channel,
            });
          }

          memoryUpdated = true;
        } catch {
          statuses[msg.id] = 'error';
        }
      }
    } else if (action === 'regenerate') {
      for (const msg of messages) {
        try {
          // Record prior feedback
          if (feedback && feedback.trim()) {
            await AgentMemoryService.recordFeedback({
              organizationId: orgId,
              category: 'regeneration_prompt',
              key: `regen_${msg.strategy || 'default'}_${msg.lead?.title || 'lead'}`,
              wasSuccessful: false,
              industry: msg.lead?.company || undefined,
              persona: msg.lead?.title || undefined,
              channel: msg.channel,
            });
            memoryUpdated = true;
          }

          // Re-generate draft with think pipeline
          const thinkRes = await orchestrator.runThink(
            msg.leadId,
            msg.campaignId || undefined,
            feedback || 'Regenerate with stronger personalized value hook',
            orgId,
            traceId
          );

          if (thinkRes.success && thinkRes.data) {
            await db.outreachMessage.updateMany({
              where: { id: msg.id, organizationId: orgId },
              data: {
                subject: thinkRes.data.subject,
                body: thinkRes.data.body,
                strategy: thinkRes.data.strategy,
                angle: thinkRes.data.angle,
                tone: thinkRes.data.tone,
                cta: thinkRes.data.cta,
                status: 'generated',
              },
            });
            statuses[msg.id] = 'regenerated';
            processedCount++;
          } else {
            statuses[msg.id] = 'regen_failed';
          }
        } catch {
          statuses[msg.id] = 'error';
        }
      }
    } else if (action === 'bulk_approve') {
      // Threshold: confidence >= minConfidence (normalized to 0-100 scale, default 85)
      const threshold = minConfidence !== undefined ? (minConfidence <= 1 ? minConfidence * 100 : minConfidence) : 85;

      for (const msg of messages) {
        try {
          const leadScore = msg.lead?.leadScore ?? (msg.lead?.score !== undefined ? msg.lead.score : 80);
          
          // Check if message meets confidence threshold
          if (leadScore < threshold) {
            statuses[msg.id] = 'skipped_low_confidence';
            safetyResults[msg.id] = {
              ready: false,
              reason: `Confidence score ${leadScore.toFixed(0)}% is below bulk approval threshold of ${threshold}%`,
            };
            continue;
          }

          // Deliverability 7-Gate safety validation
          if (deliverabilityCheck) {
            const readiness = await evaluateSendReadiness({
              organizationId: orgId,
              messageId: msg.id,
              traceId,
            });

            const blockingChecks = readiness.checks.filter(c => c.status === 'block' && c.id !== 'message_approved');

            if (blockingChecks.length > 0) {
              safetyResults[msg.id] = {
                ready: false,
                reason: blockingChecks[0].reason || 'Blocked by deliverability circuit breaker',
                checks: readiness.checks,
              };
              statuses[msg.id] = 'blocked_safety';
              continue;
            } else {
              safetyResults[msg.id] = {
                ready: true,
                reason: 'Passed pre-send deliverability safety clearance',
                checks: readiness.checks,
              };
            }
          }

          // Approve
          await db.outreachMessage.updateMany({
            where: { id: msg.id, organizationId: orgId },
            data: {
              status: 'approved',
              approvedAt: new Date(),
              approvedBy: context.userId || 'bulk_approval_system',
            },
          });

          await db.lead.updateMany({
            where: { id: msg.leadId, organizationId: orgId },
            data: { status: 'approved' },
          });

          await db.activity.create({
            data: {
              organizationId: orgId,
              leadId: msg.leadId,
              type: 'email_bulk_approved',
              description: `Bulk approved high-confidence draft (${leadScore.toFixed(0)}% confidence) with pre-send deliverability clearance`,
              phase: 'act',
            },
          });

          statuses[msg.id] = 'approved';
          processedCount++;

          // Record winning pattern in memory
          await AgentMemoryService.recordFeedback({
            organizationId: orgId,
            category: 'persona_pattern',
            key: `bulk_approved_${msg.strategy || 'default'}_${msg.lead?.title || 'lead'}`,
            wasSuccessful: true,
            industry: msg.lead?.company || undefined,
            persona: msg.lead?.title || undefined,
            channel: msg.channel,
          });
          memoryUpdated = true;
        } catch (err: any) {
          statuses[msg.id] = 'error';
        }
      }
    }

    return ok({
      processedCount,
      statuses,
      memoryUpdated,
      safetyResults,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
