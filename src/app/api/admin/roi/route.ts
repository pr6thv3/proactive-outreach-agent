import { NextRequest } from 'next/server';
import { requireWorkspace } from '@/lib/auth/context';
import { RoiCalculator } from '@/lib/admin/roi-calculator';
import { ok, fail } from '@/lib/api/responses';

export async function GET(request: NextRequest) {
  try {
    const context = await requireWorkspace(request);
    const { searchParams } = new URL(request.url);
    const hourlyRate = searchParams.get('rate') ? parseFloat(searchParams.get('rate')!) : undefined;

    const data = await RoiCalculator.calculateRoi(context.organizationId, {
      hourlyLaborRate: hourlyRate,
    });

    return ok(data);
  } catch (error: any) {
    return fail(error.message || 'Failed to calculate ROI', 500);
  }
}
