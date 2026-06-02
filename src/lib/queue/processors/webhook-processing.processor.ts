import { processResendWebhookEvent } from '@/lib/deliverability/resend-webhook-processor';
import { WebhookProcessingJobData } from '@/lib/queue/types';

export async function processWebhookProcessingJob(data: WebhookProcessingJobData) {
  return processResendWebhookEvent({
    organizationId: data.organizationId,
    webhookId: data.webhookId,
    payload: data.payload as { type?: string; data?: Record<string, any> },
    rawBody: data.rawBody,
  });
}
