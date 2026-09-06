'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Inbox,
  Mail,
  Send,
  Calendar,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  ExternalLink,
  Laptop,
  Smartphone,
  HelpCircle,
  ThumbsUp,
  RefreshCw,
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function MailboxSimulator() {
  const { data, mutate, isLoading } = useSWR('/api/simulator', fetcher);
  const items: any[] = data?.data?.items || [];

  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [deviceView, setDeviceView] = useState<'desktop' | 'mobile'>('desktop');
  const [customReply, setCustomReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastActionResult, setLastActionResult] = useState<any>(null);

  const currentItem = items[selectedItemIndex] || {
    id: 'sim_msg_1',
    leadId: 'sim_lead_1',
    prospectName: 'Sarah Jenkins',
    prospectEmail: 'sarah.jenkins@plaid.com',
    prospectTitle: 'Chief Technology Officer',
    prospectCompany: 'Plaid',
    subject: 'Quick question regarding Plaid\'s team expansion',
    body: 'Hi Sarah,\n\nNoticed Plaid recently announced your $425M Series D and is scaling security infrastructure.\n\nWe help FinTech leaders eliminate compliance bottlenecks and automate SOC2 audits. Would you be open to a 10-minute chat next Tuesday?\n\nBest,\nAlex from ProactiveReach',
    channel: 'email',
  };

  const handleSimulateAction = async (action: 'open' | 'book_meeting' | 'reply', replyTextValue?: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          messageId: currentItem.id,
          leadId: currentItem.leadId,
          recipientEmail: currentItem.prospectEmail,
          replyText: replyTextValue || customReply,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setLastActionResult(json.data);
        if (action === 'book_meeting') {
          toast.success('Meeting booked on Cal.com! Lead moved to "Meeting Booked".');
        } else if (action === 'open') {
          toast.success('Open event registered by AI SDR.');
        } else {
          toast.success(`Reply sent! AI classified as: ${json.data?.classification?.category}`);
        }
      } else {
        toast.error(json.error?.message || 'Simulation action failed');
      }
    } catch {
      toast.error('Network error during simulation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Simulator Banner */}
      <div className="rounded-xl border border-blue-900/60 bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-400" />
              Live Recipient Experience & AI SDR Reply Simulator
            </h3>
            <Badge className="bg-blue-950 text-blue-300 border border-blue-800 text-[10px]">
              Zero Domain Required
            </Badge>
          </div>
          <p className="text-slate-400 text-xs max-w-3xl">
            Test how real prospects receive your outreach on desktop & mobile clients. Click any simulated response below to watch the AI SDR classify intent, reschedule follow-ups, trigger Cal.com bookings, or enforce permanent DNC suppression in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg shrink-0">
          <button
            onClick={() => setDeviceView('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              deviceView === 'desktop' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="h-3.5 w-3.5" /> Desktop
          </button>
          <button
            onClick={() => setDeviceView('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              deviceView === 'mobile' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </button>
        </div>
      </div>

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Simulated Mailbox / Recipient Client (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-blue-400" />
              Recipient's Screen: {currentItem.prospectName} ({currentItem.prospectCompany})
            </h4>
            <span className="text-[11px] text-slate-500 font-mono">
              Inbox: {currentItem.prospectEmail}
            </span>
          </div>

          {/* Email / LinkedIn Shell */}
          <div
            className={`mx-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden transition-all duration-300 ${
              deviceView === 'mobile' ? 'max-w-[390px] border-slate-600' : 'w-full'
            }`}
          >
            {/* Top Browser / App Bar */}
            <div className="border-b border-slate-800 bg-slate-950 px-4 py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-semibold text-slate-300 pl-2">
                  {currentItem.channel?.includes('linkedin') ? 'LinkedIn Messaging' : 'Gmail — Inbox (1)'}
                </span>
              </div>
              <Badge className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                {currentItem.channel?.includes('linkedin') ? '🔗 LinkedIn' : '✉️ Inbound'}
              </Badge>
            </div>

            {/* Email Header Details */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 space-y-2">
              <h3 className="font-bold text-sm text-slate-100">{currentItem.subject}</h3>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-[11px]">
                    AR
                  </div>
                  <div>
                    <span className="font-semibold text-slate-200">Alex Rivers</span>{' '}
                    <span className="text-slate-400 text-[11px]">&lt;alex@outreach.proactivereach.ai&gt;</span>
                  </div>
                </div>
                <span className="text-slate-500 text-[11px] font-mono">Just now</span>
              </div>
            </div>

            {/* Email Body Content */}
            <div className="p-5 text-slate-200 text-xs leading-relaxed space-y-4 font-sans whitespace-pre-line min-h-[160px]">
              {currentItem.body}
            </div>

            {/* Unsubscribe & Security Footer */}
            <div className="px-5 py-3 border-t border-slate-800/60 bg-slate-950/80 text-[10px] text-slate-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> DKIM Verified • 100% Deliverability Shield
              </span>
              <button
                onClick={() => handleSimulateAction('reply', 'Please unsubscribe and remove me from your list.')}
                className="underline hover:text-slate-300 transition-colors"
              >
                Unsubscribe from these emails
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Action Station & AI SDR Live Reaction (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-blue-400" />
              1-Click Prospect Reaction Buttons
            </h4>
            <p className="text-[11px] text-slate-400 leading-normal">
              Click any scenario to simulate how {currentItem.prospectName} would reply:
            </p>

            <div className="space-y-2 pt-1">
              {/* Scenario 1: Meeting Request */}
              <button
                disabled={isSubmitting}
                onClick={() => handleSimulateAction('reply', 'Hi Alex, this is super timely. Do you have 15 mins this Thursday at 2pm EST for a quick demo?')}
                className="w-full text-left p-2.5 rounded-lg border border-emerald-900/60 bg-emerald-950/30 hover:bg-emerald-900/40 text-xs text-emerald-200 flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="font-medium">"Yes! Let's demo Thursday at 2pm"</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Scenario 2: Interested / Send Info */}
              <button
                disabled={isSubmitting}
                onClick={() => handleSimulateAction('reply', 'Interesting timing. Could you send over a benchmark case study on your deliverability rates?')}
                className="w-full text-left p-2.5 rounded-lg border border-blue-900/60 bg-blue-950/30 hover:bg-blue-900/40 text-xs text-blue-200 flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="font-medium">"Interested — send over a case study"</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Scenario 3: Product Question */}
              <button
                disabled={isSubmitting}
                onClick={() => handleSimulateAction('reply', 'How does your platform handle SOC2 compliance and multi-tenant isolation?')}
                className="w-full text-left p-2.5 rounded-lg border border-purple-900/60 bg-purple-950/30 hover:bg-purple-900/40 text-xs text-purple-200 flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-purple-400 shrink-0" />
                  <span className="font-medium">"Question about SOC2 & Security"</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Scenario 4: Out of Office */}
              <button
                disabled={isSubmitting}
                onClick={() => handleSimulateAction('reply', 'Automatic reply: I will be out of the office until Monday attending an offsite.')}
                className="w-full text-left p-2.5 rounded-lg border border-amber-900/60 bg-amber-950/30 hover:bg-amber-900/40 text-xs text-amber-200 flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="font-medium">"Out of Office until Monday"</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Scenario 5: Unsubscribe */}
              <button
                disabled={isSubmitting}
                onClick={() => handleSimulateAction('reply', 'Please unsubscribe me and remove me from your mailing list.')}
                className="w-full text-left p-2.5 rounded-lg border border-red-900/60 bg-red-950/30 hover:bg-red-900/40 text-xs text-red-200 flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-400 shrink-0" />
                  <span className="font-medium">"Unsubscribe / Not interested"</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-red-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Custom Reply Box */}
            <div className="pt-2 space-y-2 border-t border-slate-800">
              <span className="text-[11px] text-slate-400">Or type a custom prospect reply:</span>
              <div className="flex gap-2">
                <Input
                  value={customReply}
                  onChange={e => setCustomReply(e.target.value)}
                  placeholder="Type what the prospect says..."
                  className="bg-slate-950 border-slate-800 text-xs text-slate-200"
                />
                <Button
                  size="sm"
                  disabled={isSubmitting || !customReply.trim()}
                  onClick={() => handleSimulateAction('reply')}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs shrink-0"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>

          {/* AI SDR Live Reaction Box */}
          {lastActionResult && (
            <div className="rounded-xl border border-blue-800 bg-slate-900 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  AI SDR Autonomous Reaction
                </span>
                <Badge className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                  Real-Time Handled
                </Badge>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Intent Classified:</span>
                  <Badge className="bg-blue-950 text-blue-300 border border-blue-800 font-mono text-[10px]">
                    {lastActionResult?.classification?.category || lastActionResult?.action}
                  </Badge>
                  <span className="text-slate-400">Sentiment:</span>
                  <Badge className="bg-slate-800 text-slate-300 font-mono text-[10px]">
                    {lastActionResult?.classification?.sentiment || 'positive'}
                  </Badge>
                </div>

                {lastActionResult?.classification?.suggestedReply && (
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 leading-relaxed text-[11px]">
                    <span className="font-semibold text-blue-400 block mb-1">AI Proposed Response:</span>
                    "{lastActionResult.classification.suggestedReply}"
                  </div>
                )}

                {lastActionResult?.classification?.calendarLink && (
                  <div className="flex items-center justify-between p-2 rounded bg-emerald-950/40 border border-emerald-800 text-[11px] text-emerald-300">
                    <span>📅 Calendar Booking Link Active:</span>
                    <a
                      href="https://cal.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-semibold underline hover:text-emerald-200"
                    >
                      Cal.com/alex/15min <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {lastActionResult?.classification?.suppressed && (
                  <div className="p-2 rounded bg-red-950/40 border border-red-800 text-[11px] text-red-300 flex items-center gap-1.5">
                    <Ban className="h-3.5 w-3.5 shrink-0" />
                    <span>Lead permanently blacklisted in DNC table. All pending sequences terminated.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
