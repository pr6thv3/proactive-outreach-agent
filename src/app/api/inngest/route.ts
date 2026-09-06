import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  observeFunction,
  thinkFunction,
  actFunction,
  reevaluateFunction,
  enrichmentBatchFunction,
} from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    observeFunction,
    thinkFunction,
    actFunction,
    reevaluateFunction,
    enrichmentBatchFunction,
  ],
});
