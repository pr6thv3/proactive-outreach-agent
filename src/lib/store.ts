// ─── Dashboard Store (Zustand) ────────────────────────
// Production state management with Signal Intelligence, Scoring, Memory, Autonomy
// Now includes deliverability state and results-loop metrics

import { create } from 'zustand';

export interface LeadRow {
  id: string; name: string; email: string; company: string | null; title: string | null;
  status: string; source: string; emailVerified: boolean; isBlacklisted: boolean; doNotContact: boolean;
  signalCount: number; messageCount: number; activityCount: number;
  signals: Array<{ id: string; type: string; content: string; relevance: number; confidence: number; urgency?: number; recommendedPitchAngle?: string }>;
  activities: Array<{ id: string; type: string; description: string; createdAt: string }>;
  // Scoring
  leadScore: number; signalScore: number; replyProb: number; conversionProb: number; spamRisk: number;
  priorityTier: string;
  // Autonomy
  autonomyEnabled: boolean;
  createdAt: string;
}

export interface MessageRow {
  id: string; subject: string; body: string; channel: string; status: string;
  strategy: string | null; angle: string | null; tone: string | null; cta: string | null;
  sequencePos: number; approvedAt: string | null; sentAt: string | null;
  signalTypeUsed: string | null; urgencyAtGeneration: number | null; pitchAngleUsed: string | null;
  lead: { id: string; name: string; email: string; company: string | null; status: string; priorityTier?: string };
  followUps: Array<{ id: string; type: string; status: string; scheduledAt: string; sequencePos: number; channel?: string }>;
  replies: Array<{ id: string; category: string; confidence: number; replyText: string | null }>;
  createdAt: string;
}

export interface CampaignRow {
  id: string; name: string; status: string; goal: string | null; targetAudience: string | null;
  offer: string | null; senderName: string | null; senderEmail: string | null;
  tone: string; cta: string | null; maxDailySends: number; followUpSchedule: string;
  productDescription: string | null; dailySendsCount: number;
  channels: string; linkedinEnabled: boolean; autonomyEnabled: boolean;
  _count?: { messages: number };
  createdAt: string;
}

export interface ActivityRow {
  id: string; type: string; description: string; metadata: string | null; phase: string | null;
  leadId: string; lead: { name: string; company: string | null } | null; createdAt: string;
}

export interface SendingDomainRow {
  id: string; domain: string; status: string; provider: string;
  spfVerified: boolean; dkimVerified: boolean; dmarcVerified: boolean;
  warmupEnabled: boolean; warmupDay: number; warmupDailyLimit: number;
  dailySendsCount: number; dailySendsDate: string | null;
  totalSent: number; totalDelivered: number; totalBounced: number;
  totalComplained: number; totalOpened: number; totalClicked: number;
  bounceRate: number; complaintRate: number; openRate: number; clickRate: number;
  reputationScore: number;
  fromEmail: string | null; fromName: string | null;
  warmupStatus?: {
    remaining: number; isComplete: boolean; isPaused: boolean; pauseReason?: string; progressPercent: number;
  };
  createdAt: string;
}

export interface EmailEventRow {
  id: string; eventType: string; providerId: string | null; recipient: string;
  bounceType: string | null; bounceReason: string | null;
  clickUrl: string | null; complaintType: string | null;
  messageId: string | null; leadId: string | null; campaignId: string | null; domainId: string | null;
  createdAt: string;
}

export interface ReputationData {
  domainId: string; domain: string; reputationScore: number;
  totalSent: number; totalDelivered: number; totalBounced: number;
  totalComplained: number; totalOpened: number; totalClicked: number;
  bounceRate: number; complaintRate: number; openRate: number; clickRate: number;
  riskLevel: string; shouldPause: boolean; pauseReasons: string[];
}

export interface DashboardStats {
  leads: {
    total: number; new: number; enriched: number; scored: number; generated: number; approved: number;
    sent: number; interested: number; negative: number; unsubscribed: number; interestRate: string;
    hot: number; warm: number; cold: number;
    avgLeadScore: string; avgSignalScore: string; avgReplyProb: string; avgConversionProb: string; maxLeadScore: string;
  };
  messages: {
    total: number; draft: number; generated: number; approved: number; sent: number; replied: number;
    responseRate: string; channelBreakdown: Array<{ channel: string; count: number }>;
  };
  signals: {
    total: number; breakdown: Array<{ type: string; count: number }>;
    urgency: { high: number; medium: number; low: number };
    topSignals: Array<{
      type: string; urgency: number; content: string; recommendedPitchAngle: string | null;
      lead: string | null; company: string | null; priorityTier: string | null;
    }>;
  };
  followUps: { total: number; scheduled: number };
  dnc: { total: number };
  campaigns: CampaignRow[];
  recentActivities: ActivityRow[];
  recentPipelineRuns: Array<Record<string, unknown>>;
  memory: {
    categories: Array<{ category: string; count: number; avgScore: string }>;
    totalEntries: number;
  };
  queue: {
    pending: number; running: number; completed: number; failed: number; dead: number;
    byType: Record<string, number>;
  };
  pipelineMetrics: Array<Record<string, unknown>>;
  // ─── NEW: Deliverability & Results-Loop Metrics ───
  deliverability: {
    domains: Array<{
      id: string; domain: string; status: string;
      spfVerified: boolean; dkimVerified: boolean; dmarcVerified: boolean;
      reputationScore: number; warmupDay: number; warmupDailyLimit: number;
      totalSent: number; bounceRate: number; complaintRate: number; openRate: number;
    }>;
    totalSent: number; totalDelivered: number; totalBounced: number;
    totalOpened: number; totalClicked: number; totalComplained: number;
    deliveryRate: number; bounceRate: number; openRate: number;
    clickRate: number; complaintRate: number;
  };
  resultsLoop: {
    signalsFound: number;
    emailsGenerated: number;
    emailsSent: number;
    repliesReceived: number;
    positiveReplies: number;
    meetingsBooked: number;
    replyRate: number;
    positiveReplyRate: number;
    deliveryRate: number;
    openRate: number;
    bounceRate: number;
  };
}

interface DashboardState {
  stats: DashboardStats | null;
  leads: LeadRow[];
  messages: MessageRow[];
  campaigns: CampaignRow[];
  domains: SendingDomainRow[];
  emailEvents: EmailEventRow[];
  domainReputation: Record<string, ReputationData>;
  isLoading: boolean;
  activeTab: string;
  pipelineRunning: boolean;
  pipelinePhase: string | null;
  autonomyRunning: boolean;
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;

  setActiveTab: (tab: string) => void;
  setPipelineRunning: (running: boolean) => void;
  setPipelinePhase: (phase: string | null) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  fetchStats: () => Promise<void>;
  fetchLeads: (status?: string) => Promise<void>;
  fetchMessages: (status?: string) => Promise<void>;
  fetchCampaigns: () => Promise<void>;
  fetchDomains: () => Promise<void>;
  fetchEmailEvents: (filters?: Record<string, string>) => Promise<void>;
  addDomain: (domain: { domain: string; fromEmail?: string; fromName?: string; warmupEnabled?: boolean }) => Promise<void>;
  verifyDomain: (domainId: string) => Promise<void>;

  addLead: (data: { name: string; email: string; company?: string; title?: string; url?: string; linkedinUrl?: string; autonomyEnabled?: boolean }) => Promise<void>;
  importCsv: (csvText: string) => Promise<void>;
  addSampleData: () => Promise<void>;

  runObserve: (leadId: string) => Promise<void>;
  runThink: (leadId: string, campaignId?: string) => Promise<void>;
  runFullPipeline: (leadId: string, campaignId?: string) => Promise<void>;
  batchGenerate: (leadIds: string[], campaignId?: string) => Promise<void>;

  approveMessage: (messageId: string, editedSubject?: string, editedBody?: string) => Promise<void>;
  sendMessage: (messageId: string) => Promise<void>;
  approveAndSend: (messageId: string, editedSubject?: string, editedBody?: string) => Promise<void>;

  classifyReply: (leadId: string, messageId: string, replyText: string) => Promise<void>;

  createCampaign: (data: Record<string, unknown>) => Promise<void>;

  enableAutonomy: (leadId?: string, campaignId?: string) => Promise<void>;
  runAutonomousCycle: () => Promise<void>;

  refreshAll: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  stats: null, leads: [], messages: [], campaigns: [], domains: [], emailEvents: [], domainReputation: {},
  isLoading: false, activeTab: 'results', pipelineRunning: false, pipelinePhase: null, autonomyRunning: false, toasts: [],

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPipelineRunning: (running) => set({ pipelineRunning: running }),
  setPipelinePhase: (phase) => set({ pipelinePhase: phase }),
  addToast: (message, type = 'info') => {
    const id = Date.now().toString();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  fetchStats: async () => {
    try { const r = await fetch('/api/stats'); const j = await r.json(); if (j.success) set({ stats: j.data }); } catch { /* silent */ }
  },

  fetchLeads: async (status?: string) => {
    try {
      const url = status && status !== 'all' ? `/api/leads?status=${status}` : '/api/leads';
      const r = await fetch(url); const j = await r.json();
      if (j.success) {
        const leads = j.data.leads.map((l: Record<string, unknown>) => ({
          id: l.id, name: l.name, email: l.email, company: l.company, title: l.title,
          status: l.status, source: l.source, emailVerified: l.emailVerified, isBlacklisted: l.isBlacklisted, doNotContact: l.doNotContact,
          signalCount: (l._count as Record<string, number>)?.signals ?? (l.signals as unknown[])?.length ?? 0,
          messageCount: (l._count as Record<string, number>)?.messages ?? (l.messages as unknown[])?.length ?? 0,
          activityCount: (l._count as Record<string, number>)?.activities ?? (l.activities as unknown[])?.length ?? 0,
          signals: l.signals || [], activities: l.activities || [],
          leadScore: (l.leadScore as number) || 0, signalScore: (l.signalScore as number) || 0,
          replyProb: (l.replyProb as number) || 0, conversionProb: (l.conversionProb as number) || 0,
          spamRisk: (l.spamRisk as number) || 0, priorityTier: (l.priorityTier as string) || 'cold',
          autonomyEnabled: (l.autonomyEnabled as boolean) || false,
          createdAt: l.createdAt,
        }));
        set({ leads });
      }
    } catch { /* silent */ }
  },

  fetchMessages: async (status?: string) => {
    try {
      const url = status ? `/api/messages?status=${status}` : '/api/messages';
      const r = await fetch(url); const j = await r.json();
      if (j.success) set({ messages: j.data });
    } catch { /* silent */ }
  },

  fetchCampaigns: async () => {
    try { const r = await fetch('/api/campaigns'); const j = await r.json(); if (j.success) set({ campaigns: j.data }); } catch { /* silent */ }
  },

  fetchDomains: async () => {
    try {
      const r = await fetch('/api/domains'); const j = await r.json();
      if (j.success) {
        const domains = j.data.map((d: Record<string, unknown>) => ({
          id: d.id, domain: d.domain, status: d.status, provider: d.provider,
          spfVerified: d.spfVerified, dkimVerified: d.dkimVerified, dmarcVerified: d.dmarcVerified,
          warmupEnabled: d.warmupEnabled, warmupDay: d.warmupDay as number, warmupDailyLimit: d.warmupDailyLimit as number,
          dailySendsCount: d.dailySendsCount as number, dailySendsDate: d.dailySendsDate as string | null,
          totalSent: d.totalSent as number, totalDelivered: d.totalDelivered as number, totalBounced: d.totalBounced as number,
          totalComplained: d.totalComplained as number, totalOpened: d.totalOpened as number, totalClicked: d.totalClicked as number,
          bounceRate: d.bounceRate as number, complaintRate: d.complaintRate as number,
          openRate: d.openRate as number, clickRate: d.clickRate as number,
          reputationScore: d.reputationScore as number,
          fromEmail: d.fromEmail as string | null, fromName: d.fromName as string | null,
          warmupStatus: d.warmupStatus as SendingDomainRow['warmupStatus'],
          createdAt: d.createdAt as string,
        }));
        set({ domains });
      }
    } catch { /* silent */ }
  },

  fetchEmailEvents: async (filters?: Record<string, string>) => {
    try {
      const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
      const r = await fetch(`/api/email-events${params}`); const j = await r.json();
      if (j.success) set({ emailEvents: j.data.events });
    } catch { /* silent */ }
  },

  addDomain: async (data) => {
    try {
      const r = await fetch('/api/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (j.success) { get().addToast(`Domain "${data.domain}" added! Add DNS records and verify.`, 'success'); await get().fetchDomains(); }
      else get().addToast(j.error || 'Failed to add domain', 'error');
    } catch { get().addToast('Failed to add domain', 'error'); }
  },

  verifyDomain: async (domainId) => {
    try {
      const r = await fetch('/api/domains', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domainId, action: 'verify' }) });
      const j = await r.json();
      if (j.success) { get().addToast('Domain verification triggered! Check DNS status.', 'success'); await get().fetchDomains(); }
      else get().addToast(j.data?.error || j.error || 'Verification failed', 'error');
    } catch { get().addToast('Verification failed', 'error'); }
  },

  addLead: async (data) => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_lead', ...data }) });
      const j = await r.json();
      if (j.success) { get().addToast(`Lead "${data.name}" added`, 'success'); await get().refreshAll(); }
      else get().addToast(j.error || 'Failed to add lead', 'error');
    } catch { get().addToast('Failed to add lead', 'error'); }
  },

  importCsv: async (csvText) => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import_csv', csvText }) });
      const j = await r.json();
      if (j.success) { const d = j.data; get().addToast(`CSV imported: ${d.created} created, ${d.updated} updated, ${d.skipped} skipped, ${d.dncBlocked} DNC blocked`, 'success'); await get().refreshAll(); }
      else get().addToast(j.error || 'Import failed', 'error');
    } catch { get().addToast('CSV import failed', 'error'); }
  },

  addSampleData: async () => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_sample_data' }) });
      const j = await r.json();
      if (j.success) { get().addToast('Sample data loaded with signal intelligence + memory!', 'success'); await get().refreshAll(); }
    } catch { get().addToast('Failed to load sample data', 'error'); }
  },

  runObserve: async (leadId) => {
    set({ pipelineRunning: true, pipelinePhase: 'observe' }); get().addToast('Running OBSERVE (scrape + signal intelligence + scoring)...', 'info');
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_observe', leadId }) });
      const j = await r.json();
      if (j.success) get().addToast('Observe phase complete — signals + intelligence + scores updated!', 'success');
      else get().addToast(j.data?.error || 'Observe failed', 'error');
    } catch { get().addToast('Observe failed', 'error'); }
    finally { set({ pipelineRunning: false, pipelinePhase: null }); await get().refreshAll(); }
  },

  runThink: async (leadId, campaignId) => {
    set({ pipelineRunning: true, pipelinePhase: 'think' }); get().addToast('Running THINK (strategy + pitch + personalization)...', 'info');
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_think', leadId, campaignId }) });
      const j = await r.json();
      if (j.success) get().addToast('Email sequence generated with signal intelligence! Review in Approval Queue.', 'success');
      else get().addToast(j.data?.error || 'Think failed', 'error');
    } catch { get().addToast('Think failed', 'error'); }
    finally { set({ pipelineRunning: false, pipelinePhase: null }); await get().refreshAll(); }
  },

  runFullPipeline: async (leadId, campaignId) => {
    set({ pipelineRunning: true, pipelinePhase: 'observe' }); get().addToast('Running full pipeline (Observe + Signal Intelligence + Scoring + Think)...', 'info');
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_full_pipeline', leadId, campaignId }) });
      const j = await r.json();
      if (j.success) get().addToast('Pipeline complete with signal intelligence + scores! Review emails in the Approval Queue.', 'success');
      else get().addToast('Pipeline had errors', 'error');
    } catch { get().addToast('Pipeline failed', 'error'); }
    finally { set({ pipelineRunning: false, pipelinePhase: null }); await get().refreshAll(); }
  },

  batchGenerate: async (leadIds, campaignId) => {
    set({ pipelineRunning: true, pipelinePhase: 'think' }); get().addToast(`Generating for ${leadIds.length} leads with signal intelligence...`, 'info');
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'batch_generate', leadIds, campaignId }) });
      const j = await r.json();
      if (j.success) get().addToast(`Batch generation complete!`, 'success');
    } catch { get().addToast('Batch generation failed', 'error'); }
    finally { set({ pipelineRunning: false, pipelinePhase: null }); await get().refreshAll(); }
  },

  approveMessage: async (messageId, editedSubject, editedBody) => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_message', messageId, editedSubject, editedBody }) });
      const j = await r.json();
      if (j.success) { get().addToast('Email approved!', 'success'); await get().refreshAll(); }
      else get().addToast(j.error || 'Approval failed', 'error');
    } catch { get().addToast('Approval failed', 'error'); }
  },

  sendMessage: async (messageId) => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send_message', messageId, dryRun: false }) });
      const j = await r.json();
      if (j.success) { get().addToast('Email sent via Resend!', 'success'); await get().refreshAll(); }
      else get().addToast(j.data?.error || 'Send failed', 'error');
    } catch { get().addToast('Send failed', 'error'); }
  },

  approveAndSend: async (messageId, editedSubject, editedBody) => {
    try {
      // First approve (with edit tracking)
      const approveR = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_message', messageId, editedSubject, editedBody }) });
      const approveJ = await approveR.json();
      if (!approveJ.success) { get().addToast(approveJ.error || 'Approval failed', 'error'); return; }

      // Then send for real
      const sendR = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send_message', messageId, dryRun: false }) });
      const sendJ = await sendR.json();
      if (sendJ.success) { get().addToast('Email approved and sent via Resend!', 'success'); await get().refreshAll(); }
      else get().addToast(sendJ.data?.error || 'Send failed', 'error');
    } catch { get().addToast('Approve & send failed', 'error'); }
  },

  classifyReply: async (leadId, messageId, replyText) => {
    set({ pipelineRunning: true, pipelinePhase: 'reeval' });
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_reeval', leadId, messageId, replyText }) });
      const j = await r.json();
      if (j.success) { const cat = j.data?.data?.category || 'unknown'; get().addToast(`Reply classified: ${cat} (memory updated)`, 'success'); }
    } catch { get().addToast('Classification failed', 'error'); }
    finally { set({ pipelineRunning: false, pipelinePhase: null }); await get().refreshAll(); }
  },

  createCampaign: async (data) => {
    try {
      const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (j.success) { get().addToast('Campaign created!', 'success'); await get().refreshAll(); }
      else get().addToast(j.error || 'Failed', 'error');
    } catch { get().addToast('Failed', 'error'); }
  },

  enableAutonomy: async (leadId, campaignId) => {
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable_autonomy', leadId, campaignId }) });
      const j = await r.json();
      if (j.success) { get().addToast('Autonomy enabled! System will auto-discover + enrich + draft + schedule.', 'success'); await get().refreshAll(); }
      else get().addToast(j.error || 'Failed to enable autonomy', 'error');
    } catch { get().addToast('Failed to enable autonomy', 'error'); }
  },

  runAutonomousCycle: async () => {
    set({ autonomyRunning: true }); get().addToast('Running autonomous cycle (discover → enrich → score → draft → schedule → learn)...', 'info');
    try {
      const r = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run_autonomous_cycle' }) });
      const j = await r.json();
      if (j.success) {
        const d = j.data;
        get().addToast(`Autonomous cycle: ${d.discovered} discovered, ${d.scored} scored, ${d.drafted} drafted, ${d.learned} learned`, 'success');
      }
    } catch { get().addToast('Autonomous cycle failed', 'error'); }
    finally { set({ autonomyRunning: false }); await get().refreshAll(); }
  },

  refreshAll: async () => {
    await Promise.all([get().fetchStats(), get().fetchLeads(), get().fetchMessages(), get().fetchCampaigns(), get().fetchDomains()]);
  },
}));
