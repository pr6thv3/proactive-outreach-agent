# Permanent Engineering Standards & Architectural Guardrails
**Project**: `pr6thv3/proactive-outreach-agent`  
**Status**: APPROVED & RATIFIED  
**Date**: July 24, 2026

This document defines mandatory architectural guardrails and implementation standards for all present and future development in the `proactive-outreach-agent` repository.

---

## Standard 1: Domain Verification Dual-Mode Standard

### Rule
All deliverability, domain verification, and external infrastructure integrations MUST implement a dual-mode execution strategy:

1. **Production Mode**: Use real provider APIs and SDKs (e.g. Resend `domains.verify`, `domains.create`, `domains.get`) when live environment credentials (`RESEND_API_KEY`) are present.
2. **Local / Test Fallback Mode**: Automatically fall back to a safe, deterministic simulation mode when external provider credentials are not configured or when running in local development/test environments (`AUTH_DEV_BYPASS=true` or missing API keys).

### Objective
Engineers must be able to run, develop, and test the full application lifecycle end-to-end locally without requiring live external DNS records or active third-party SaaS subscriptions.

### Reference Implementation
[`src/lib/deliverability/index.ts`](file:///home/pr6thv3/proactive-outreach-agent/src/lib/deliverability/index.ts#L270-L295):
```typescript
async verifyDomain(domainId: string, organizationId?: string): Promise<DomainDnsStatus> {
  const domain = await db.sendingDomain.findFirst({
    where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
  });

  if (domain?.apiKeyRef && isResendConfigured()) {
    // 1. Production Mode: Trigger live verification via Resend API
    await verifyDomainInResend(domain.apiKeyRef);
  } else if (!isResendConfigured()) {
    // 2. Safe Fallback Mode: Simulate verified state for local dev/testing
    await db.sendingDomain.updateMany({
      where: { id: domainId, ...(organizationId ? { organizationId } : {}) },
      data: {
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        spfStatus: 'verified',
        dkimStatus: 'verified',
        dmarcStatus: 'verified',
        status: 'verified',
        lastVerifiedAt: new Date(),
      },
    });
  }

  return checkDomainDnsStatus(domainId, organizationId);
}
```

---

## Standard 2: Infrastructure Action Gate Standard

### Rule
Any user interface action or system workflow that depends on underlying infrastructure assets (such as starting a campaign, sending batch emails, or scheduling automated outreach) MUST remain programmatically disabled until all infrastructure prerequisites are satisfied.

### Requirements
1. **Prerequisite Check**: The UI component or API action must explicitly evaluate prerequisite status (e.g. `domain.status === 'verified'`).
2. **Visual Explanation**: When disabled, the UI must clearly explain what is blocking the action (e.g. *"Domain Verification Required"* or *"⚠️ Sending domain verification required to start campaign sending"*).
3. **Automatic Unlock**: As soon as prerequisite infrastructure status transitions to verified/active, the UI must automatically unlock and enable the action button without requiring a full app reload.

### Reference Implementation
[`src/components/dashboard/campaign-panel.tsx`](file:///home/pr6thv3/proactive-outreach-agent/src/components/dashboard/campaign-panel.tsx#L20-L80):
```tsx
const hasVerifiedDomain = domains.length > 0 && domains.some(d => d.status === 'verified');

<Button
  size="sm"
  disabled={!hasVerifiedDomain}
  className={`h-7 text-[11px] px-3 ${
    hasVerifiedDomain
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
  }`}
>
  <Play className="w-3 h-3 mr-1" />
  {hasVerifiedDomain ? 'Start Campaign' : 'Domain Verification Required'}
</Button>
```

---

## Compliance & Enforcement
- **Automated Verification**: These guardrails are enforced via `npm run test:hardening` and TypeScript compilation (`npm run typecheck`).
- **PR Review Requirement**: All new feature submissions and PRs must conform to these standards.
