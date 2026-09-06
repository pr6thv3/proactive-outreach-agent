'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Inbox,
  Sparkles,
  Calendar,
  Send,
  HelpCircle,
  Clock,
  Ban,
  UserCheck,
  Building2,
  ChevronRight,
  ShieldCheck,
  ThumbsDown,
  Search,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import useSWR from 'swr';
import { ClassifyReplyDialog } from './classify-reply-dialog';
import { EmptyState } from '@/components/dashboard/empty-state';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function SmartInbox() {
  const [filterTab, setFilterTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('inbox_1');
  const [replyText, setReplyText] = useState<string>('');
  const [isActing, setIsActing] = useState<boolean>(false);

  const { data, mutate, isLoading } = useSWR('/api/inbox', fetcher, {
    refreshInterval: 15000,
  });

  const rawThreads: any[] = data?.data?.threads || [];
  const counts = data?.data?.counts || {
    all: rawThreads.length,
    meeting_request: 0,
    interested: 0,
    question: 0,
    out_of_office: 0,
    unsubscribe: 0,
    not_interested: 0,
  };

  const filteredThreads = rawThreads.filter(t => {
    // Tab Filter
    if (filterTab !== 'all') {
      if (filterTab === 'out_of_office' && t.category !== 'out_of_office' && t.category !== 'ooo') return false;
      if (filterTab === 'not_interested' && t.category !== 'not_interested' && t.category !== 'negative') return false;
      if (filterTab === 'question' && t.category !== 'question' && t.category !== 'needs_info') return false;
      if (t.category !== filterTab && filterTab !== 'out_of_office' && filterTab !== 'not_interested' && filterTab !== 'question') return false;
    }
    // Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.prospectName?.toLowerCase().includes(q) ||
        t.prospectCompany?.toLowerCase().includes(q) ||
        t.prospectEmail?.toLowerCase().includes(q) ||
        t.snippet?.toLowerCase().includes(q) ||
        t.fullReply?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeThread = filteredThreads.find(t => t.id === selectedThreadId) || filteredThreads[0] || rawThreads[0];

  const handleSendReply = async () => {
    if (!activeThread) return;
    setIsActing(true);
    try {
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_reply',
          leadId: activeThread.leadId,
          replyBody: replyText || activeThread.aiSuggestedReply,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`AI Response dispatched to ${activeThread.prospectName} (${activeThread.prospectEmail})!`);
        setReplyText('');
        mutate();
      } else {
        toast.error('Failed to dispatch reply');
      }
    } catch {
      toast.error('Error dispatching reply');
    } finally {
      setIsActing(false);
    }
  };

  const handleBookMeeting = async () => {
    if (!activeThread) return;
    setIsActing(true);
    try {
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'book_meeting',
          leadId: activeThread.leadId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Meeting confirmed! Calendar invite sent to ${activeThread.prospectName}. Sequence stopped.`);
        mutate();
      }
    } catch {
      toast.error('Error booking meeting');
    } finally {
      setIsActing(false);
    }
  };

  const handleSnooze = async (days = 7) => {
    if (!activeThread) return;
    setIsActing(true);
    const snoozeDate = new Date(Date.now() + days * 86400000);
    try {
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'snooze',
          leadId: activeThread.leadId,
          snoozeUntil: snoozeDate.toISOString(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Sequence snoozed until ${snoozeDate.toLocaleDateString()}!`);
        mutate();
      }
    } catch {
      toast.error('Error snoozing sequence');
    } finally {
      setIsActing(false);
    }
  };

  const handleSuppress = async () => {
    if (!activeThread) return;
    setIsActing(true);
    try {
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suppress',
          leadId: activeThread.leadId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`${activeThread.prospectName} permanently suppressed (DNC Blacklist).`);
        mutate();
      }
    } catch {
      toast.error('Error suppressing lead');
    } finally {
      setIsActing(false);
    }
  };

  const handleReclassify = async (newCat: string) => {
    if (!activeThread) return;
    setIsActing(true);
    try {
      const res = await fetch('/api/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reclassify',
          messageId: activeThread.id,
          newCategory: newCat,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Reclassified as ${newCat.replace('_', ' ')}!`);
        mutate();
      }
    } catch {
      toast.error('Error reclassifying thread');
    } finally {
      setIsActing(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'meeting_request':
        return (
          <Badge className="bg-emerald-950 text-emerald-300 border-emerald-700 gap-1 font-medium">
            <Calendar className="h-3 w-3 text-emerald-400" /> Meeting Request
          </Badge>
        );
      case 'interested':
        return (
          <Badge className="bg-blue-950 text-blue-300 border-blue-700 gap-1 font-medium">
            <UserCheck className="h-3 w-3 text-blue-400" /> Interested Lead
          </Badge>
        );
      case 'question':
      case 'needs_info':
        return (
          <Badge className="bg-purple-950 text-purple-300 border-purple-700 gap-1 font-medium">
            <HelpCircle className="h-3 w-3 text-purple-400" /> Product Question
          </Badge>
        );
      case 'out_of_office':
      case 'ooo':
        return (
          <Badge className="bg-amber-950 text-amber-300 border-amber-700 gap-1 font-medium">
            <Clock className="h-3 w-3 text-amber-400" /> Out of Office
          </Badge>
        );
      case 'unsubscribe':
        return (
          <Badge className="bg-red-950 text-red-300 border-red-700 gap-1 font-medium">
            <Ban className="h-3 w-3 text-red-400" /> Unsubscribed (DNC)
          </Badge>
        );
      case 'not_interested':
      case 'negative':
        return (
          <Badge className="bg-slate-800 text-slate-300 border-slate-700 gap-1 font-medium">
            <ThumbsDown className="h-3 w-3 text-slate-400" /> Not Interested
          </Badge>
        );
      default:
        return <Badge variant="outline" className="border-slate-700 text-slate-300">Reply</Badge>;
    }
  };

  if (isLoading && rawThreads.length === 0) {
    return <div className="p-12 text-center text-slate-400">Loading AI Smart Inbox...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar & Category Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
          <Button
            size="sm"
            variant={filterTab === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterTab('all')}
            className={filterTab === 'all' ? 'bg-blue-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <Inbox className="mr-1.5 h-3.5 w-3.5" /> All ({counts.all || rawThreads.length})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'meeting_request' ? 'default' : 'outline'}
            onClick={() => setFilterTab('meeting_request')}
            className={filterTab === 'meeting_request' ? 'bg-emerald-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Meetings ({counts.meeting_request || 0})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'interested' ? 'default' : 'outline'}
            onClick={() => setFilterTab('interested')}
            className={filterTab === 'interested' ? 'bg-blue-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <UserCheck className="mr-1.5 h-3.5 w-3.5 text-blue-400" /> Interested ({counts.interested || 0})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'question' ? 'default' : 'outline'}
            onClick={() => setFilterTab('question')}
            className={filterTab === 'question' ? 'bg-purple-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <HelpCircle className="mr-1.5 h-3.5 w-3.5 text-purple-400" /> Questions ({counts.question || 0})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'out_of_office' ? 'default' : 'outline'}
            onClick={() => setFilterTab('out_of_office')}
            className={filterTab === 'out_of_office' ? 'bg-amber-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5 text-amber-400" /> Out of Office ({counts.out_of_office || 0})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'not_interested' ? 'default' : 'outline'}
            onClick={() => setFilterTab('not_interested')}
            className={filterTab === 'not_interested' ? 'bg-slate-700 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <ThumbsDown className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Not Interested ({counts.not_interested || 0})
          </Button>
          <Button
            size="sm"
            variant={filterTab === 'unsubscribe' ? 'default' : 'outline'}
            onClick={() => setFilterTab('unsubscribe')}
            className={filterTab === 'unsubscribe' ? 'bg-red-600 text-white font-medium h-8' : 'border-slate-800 text-slate-400 hover:text-white h-8'}
          >
            <Ban className="mr-1.5 h-3.5 w-3.5 text-red-400" /> Opt-Outs ({counts.unsubscribe || 0})
          </Button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ClassifyReplyDialog onClassified={() => mutate()} />
          <Button size="sm" variant="ghost" onClick={() => mutate()} className="text-slate-400 hover:text-white h-8 w-8 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rawThreads.length === 0 && !isLoading ? (
        <Card className="border-slate-800 bg-slate-900 text-slate-100">
          <EmptyState
            icon={<Inbox className="h-8 w-8 text-blue-400" />}
            title="AI Smart Inbox is Clean & Empty"
            description="No inbound prospect replies yet. Load high-intent sample conversations to test automated 6-category classification, meeting escalation, and OOO handling."
            onSeedSample={async () => {
              await fetch('/api/seed-sample', { method: 'POST' });
              mutate();
            }}
            seedLabel="Load Sample High-Intent Data"
          />
        </Card>
      ) : (
        /* 2-Pane Split: Thread List (5 cols) & Active Thread View (7 cols) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[620px]">
        {/* Left Pane: Search + Thread List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search replies, prospects, companies..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 bg-slate-900 border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 h-9"
            />
          </div>

          <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No conversation threads found matching filter.
              </div>
            ) : (
              filteredThreads.map(thread => {
                const isSelected = activeThread?.id === thread.id;
                return (
                  <Card
                    key={thread.id}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setReplyText(thread.aiSuggestedReply || '');
                    }}
                    className={`cursor-pointer transition-all duration-150 border ${
                      isSelected
                        ? 'border-blue-500 bg-slate-900/90 shadow-lg shadow-blue-950/40'
                        : 'border-slate-800/80 bg-slate-950 hover:bg-slate-900/60'
                    } text-slate-100 p-4 rounded-xl`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                          {thread.prospectName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(thread.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        <span className="font-medium text-slate-300">{thread.prospectCompany}</span>
                        <span>•</span>
                        <span className="truncate text-slate-400">{thread.prospectTitle}</span>
                      </div>

                      <div className="text-xs text-slate-300 line-clamp-2 leading-relaxed italic bg-slate-900/40 p-2 rounded-lg border border-slate-800/50">
                        "{thread.snippet}"
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {getCategoryBadge(thread.category)}
                          {thread.channel?.includes('linkedin') ? (
                            <Badge className="bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px]">
                              🔗 LinkedIn
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                              ✉️ Email
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className={`h-4 w-4 ${isSelected ? 'text-blue-400' : 'text-slate-600'}`} />
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Detailed Conversation & AI Action Station */}
        <div className="lg:col-span-7">
          {activeThread ? (
            <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-2xl h-full flex flex-col justify-between rounded-xl">
              <div>
                {/* Header with prospect details & quick triage buttons */}
                <CardHeader className="border-b border-slate-800/80 pb-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg font-bold">{activeThread.prospectName}</CardTitle>
                        {getCategoryBadge(activeThread.category)}
                        {activeThread.channel?.includes('linkedin') ? (
                          <Badge className="bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px]">
                            🔗 LinkedIn Thread
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                            ✉️ Email Thread
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-slate-400 text-xs font-mono mt-1">
                        {activeThread.prospectEmail} • {activeThread.prospectTitle} at {activeThread.prospectCompany}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeThread.category === 'meeting_request' && (
                        <Button
                          size="sm"
                          disabled={isActing}
                          onClick={handleBookMeeting}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/40 h-8"
                        >
                          <Calendar className="mr-1.5 h-3.5 w-3.5" />
                          Book Meeting
                        </Button>
                      )}

                      {activeThread.category === 'interested' && (
                        <Button
                          size="sm"
                          disabled={isActing}
                          onClick={handleBookMeeting}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold h-8"
                        >
                          <Calendar className="mr-1.5 h-3.5 w-3.5" />
                          Book Meeting
                        </Button>
                      )}

                      {activeThread.category === 'out_of_office' && (
                        <Button
                          size="sm"
                          disabled={isActing}
                          onClick={() => handleSnooze(7)}
                          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold h-8"
                        >
                          <Clock className="mr-1.5 h-3.5 w-3.5" />
                          Snooze (+7 Days)
                        </Button>
                      )}

                      {activeThread.category === 'unsubscribe' && (
                        <Button
                          size="sm"
                          disabled={isActing}
                          onClick={handleSuppress}
                          className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold h-8"
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" />
                          Suppress (DNC)
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-5">
                  {/* Inbound Reply Bubble */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Inbound Reply from Prospect</span>
                      <span className="font-mono text-[11px]">{new Date(activeThread.receivedAt).toLocaleString()}</span>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {activeThread.fullReply}
                    </div>
                  </div>

                  {/* AI Evidence / Context Pill if Question or Meeting */}
                  {activeThread.evidenceSnapshot && (
                    <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-3 text-xs flex items-center justify-between text-purple-300">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-purple-400 shrink-0" />
                        <span><strong>Trigger Signal Grounding:</strong> {activeThread.evidenceSnapshot.triggerSignal}</span>
                      </div>
                      <Badge variant="outline" className="border-purple-800 text-[10px] text-purple-300">
                        SOC2 Verified
                      </Badge>
                    </div>
                  )}

                  {/* Unsubscribe Permanent Suppression Card */}
                  {activeThread.category === 'unsubscribe' && (
                    <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                        <ShieldCheck className="h-4 w-4" />
                        Permanent DNC Suppression & Blacklist Active
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        This prospect has been permanently registered in the workspace <code>DoNotContact</code> list and marked <code>isBlacklisted: true</code>.
                        The 7-gate deliverability circuit breaker guarantees <strong>0 future dispatches</strong> across all current and future campaigns.
                      </p>
                    </div>
                  )}

                  {/* AI Suggested Response Box */}
                  {activeThread.category !== 'unsubscribe' && (
                    <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-blue-400 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4" />
                          AI SDR Suggested Action & Response
                        </span>
                        <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-300">
                          {activeThread.confidence ? `${Math.round(activeThread.confidence * 100)}% Confidence` : 'High Confidence'}
                        </Badge>
                      </div>

                      <textarea
                        rows={4}
                        value={replyText || activeThread.aiSuggestedReply || ''}
                        onChange={e => setReplyText(e.target.value)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-100 font-sans leading-relaxed focus:outline-none focus:border-blue-500"
                        placeholder="Type or review AI-drafted reply..."
                      />

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-400">
                          Dispatches from verified inbox: <span className="font-mono text-slate-300">alex@outreach.proactivereach.com</span>
                        </span>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={isActing}
                            onClick={handleSendReply}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold h-8"
                          >
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            Send AI Response
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Manual Reclassification Dropdown */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-800/60 text-xs text-slate-400">
                    <span>Re-classify category:</span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('meeting_request')} className="h-7 text-[11px] text-emerald-400 hover:bg-emerald-950">
                        Meeting
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('interested')} className="h-7 text-[11px] text-blue-400 hover:bg-blue-950">
                        Interested
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('question')} className="h-7 text-[11px] text-purple-400 hover:bg-purple-950">
                        Question
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('out_of_office')} className="h-7 text-[11px] text-amber-400 hover:bg-amber-950">
                        OOO
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('not_interested')} className="h-7 text-[11px] text-slate-400 hover:bg-slate-800">
                        Not Interested
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReclassify('unsubscribe')} className="h-7 text-[11px] text-red-400 hover:bg-red-950">
                        Unsubscribe
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </div>

              {/* Bottom Status Ribbon */}
              <div className="p-3.5 border-t border-slate-800 bg-slate-950/70 flex justify-between items-center text-xs text-slate-400 rounded-b-xl">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Dynamic 4-step sequence automatically interrupted on reply
                </span>
                <span className="font-mono text-blue-400 text-[11px]">
                  Category: {activeThread.category?.toUpperCase()}
                </span>
              </div>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900 p-12 text-center text-slate-400 h-full flex items-center justify-center rounded-xl">
              Select a conversation thread to view the AI analysis and reply station.
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
