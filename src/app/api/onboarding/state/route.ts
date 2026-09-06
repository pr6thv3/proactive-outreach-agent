import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspace } from '@/lib/auth/context';
import { createTraceId, handleApiError, ok } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  const traceId = createTraceId();
  try {
    const context = await requireWorkspace(request);

    const [preference, icp, domains, recentCampaign] = await Promise.all([
      db.userPreference.findUnique({ where: { userId: context.userId } }),
      db.icpCriteria.findUnique({ where: { organizationId: context.organizationId } }),
      db.sendingDomain.findMany({ where: { organizationId: context.organizationId }, take: 5 }),
      db.campaign.findFirst({ where: { organizationId: context.organizationId }, orderBy: { createdAt: 'desc' } }),
    ]);

    let safeIcp = null;
    if (icp) {
      const parseArr = (v: any) => {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        try { return JSON.parse(v); } catch { return [v]; }
      };

      safeIcp = {
        ...icp,
        industries: parseArr(icp.industries),
        techStack: parseArr(icp.techStack),
        excludeTechStack: parseArr(icp.excludeTechStack),
        requiredSignals: parseArr(icp.requiredSignals),
        painPoints: parseArr(icp.painPoints),
      };
    }

    return ok({
      step: preference?.onboardingStep || 1,
      complete: preference?.onboardingComplete || false,
      preference: preference || null,
      icp: safeIcp,
      domains: domains || [],
      recentCampaign: recentCampaign || null,
    }, traceId);
  } catch (error) {
    return handleApiError(error, traceId);
  }
}
