'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Edit3, Send, Mail, Loader2, Shield, Brain } from 'lucide-react';
import { useState } from 'react';

const SIGNAL_LABELS: Record<string, string> = {
  funding_round: 'Funding Round',
  hiring_spike: 'Hiring Spike',
  engineering_hiring_spike: 'Eng Hiring Spike',
  traffic_drop: 'Traffic Drop',
  product_launch: 'Product Launch',
  rebranding: 'Rebranding',
  seo_decline: 'SEO Decline',
  tech_stack_migration: 'Tech Migration',
  competitor_pressure: 'Competitor Pressure',
  ai_adoption_signal: 'AI Adoption',
  pain_point: 'Pain Point',
  growth: 'Growth Signal',
  expansion: 'Expansion',
  job_change: 'Job Change',
  tech_stack: 'Tech Stack',
  personalization_hook: 'Personalization Hook',
  trigger: 'Trigger',
  hiring: 'Hiring',
  funding: 'Funding',
  news: 'News',
};

export function ApprovalQueue() {
  const { messages, approveMessage, sendMessage } = useDashboardStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  const [readinessData, setReadinessData] = useState<Record<string, any>>({});
  const [loadingReadiness, setLoadingReadiness] = useState<Record<string, boolean>>({});

  const generated = messages.filter(m => m.status === 'generated');
  const approved = messages.filter(m => m.status === 'approved');

  const startEdit = (msg: typeof generated[0]) => {
    setEditingId(msg.id);
    setEditSubject(msg.subject);
    setEditBody(msg.body);
  };

  const handleApprove = async (msgId: string) => {
    if (editingId === msgId) {
      await approveMessage(msgId, editSubject, editBody);
      setEditingId(null);
    } else {
      await approveMessage(msgId);
    }
  };

  const fetchReadiness = async (msgId: string) => {
    setLoadingReadiness(prev => ({ ...prev, [msgId]: true }));
    try {
      const res = await fetch(`/api/messages/${msgId}/send-readiness`);
      if (res.ok) {
        const data = await res.json();
        setReadinessData(prev => ({ ...prev, [msgId]: data.data }));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingReadiness(prev => ({ ...prev, [msgId]: false }));
    }
  };

  const toggleReadiness = (msgId: string) => {
    if (readinessData[msgId]) {
      setReadinessData(prev => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    } else {
      fetchReadiness(msgId);
    }
  };

  const renderReadiness = (msgId: string) => {
    const data = readinessData[msgId];
    if (loadingReadiness[msgId]) {
      return (
        <div className="mt-2 p-3 rounded bg-slate-950 border border-slate-800/80 flex justify-center py-4">
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        </div>
      );
    }
    if (!data) return null;

    return (
      <div className="mt-2 p-2.5 rounded bg-slate-950 border border-slate-800/80 text-[11px] space-y-2">
        <div className="flex items-center justify-between mb-1.5 border-b border-slate-800 pb-1.5">
          <span className="font-semibold text-slate-300">Send Readiness Report</span>
          <Badge className={
            data.ready
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/15 text-red-400 border border-red-500/20'
          }>
            {data.ready ? 'Ready to Send' : 'Cannot Send'}
          </Badge>
        </div>
        
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
          {data.checks.map((check: any) => (
            <div key={check.id} className="flex items-start justify-between gap-3 text-[10px]">
              <div className="flex-1">
                <div className="font-medium text-slate-300 flex items-center gap-1.5">
                  <span className={
                    check.status === 'pass' ? 'w-1.5 h-1.5 rounded-full bg-emerald-500' :
                    check.status === 'warn' ? 'w-1.5 h-1.5 rounded-full bg-amber-500' :
                    'w-1.5 h-1.5 rounded-full bg-red-500'
                  } />
                  {check.label}
                </div>
                <div className="text-slate-500 mt-0.5">{check.reason}</div>
              </div>
              <span className={
                check.status === 'pass' ? 'text-emerald-400 text-[9px] shrink-0 font-medium' :
                check.status === 'warn' ? 'text-amber-400 text-[9px] shrink-0 font-medium' :
                'text-red-400 text-[9px] shrink-0 font-medium'
              }>
                {check.status === 'pass' ? 'Ready' : check.status === 'warn' ? 'Can queue' : 'Blocked'}
              </span>
            </div>
          ))}
        </div>
        
        <div className="text-[9px] text-slate-600 font-mono mt-1 pt-1.5 border-t border-slate-800/50 flex justify-between">
          <span>Trace ID: {data.traceId}</span>
        </div>
      </div>
    );
  };

  const renderEvidence = (msg: any) => {
    if (!msg.evidenceSnapshot?.signals || msg.evidenceSnapshot.signals.length === 0) return null;
    return (
      <div className="mt-3 p-2.5 rounded bg-slate-900/80 border border-slate-800/80">
        <div className="text-[10px] font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
          <Brain className="w-3 h-3 text-purple-400" />
          Cited Evidence & Citations
        </div>
        <div className="space-y-1.5">
          {msg.evidenceSnapshot.signals.map((sig: any, sidx: number) => (
            <div key={sidx} className="text-[10px] text-slate-400 flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Badge className="text-[8px] h-3.5 px-1 bg-slate-800 text-slate-300 border border-slate-700">
                    {SIGNAL_LABELS[sig.type] || sig.type}
                  </Badge>
                  {sig.summary}
                </div>
                {sig.sourceUrl && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[8px] text-slate-500">Source:</span>
                    <a href={sig.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[8px] text-blue-400 hover:underline truncate max-w-[200px]">{sig.sourceTitle || sig.sourceUrl}</a>
                    {sig.citationQuality && (
                      <span className={`text-[8px] px-1 rounded ${
                        sig.citationQuality === 'strong' ? 'text-emerald-400 bg-emerald-500/10' :
                        sig.citationQuality === 'medium' ? 'text-amber-400 bg-amber-500/10' :
                        'text-slate-400 bg-slate-800'
                      }`}>{sig.citationQuality}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {generated.length === 0 && approved.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-700/50 p-8 text-center">
          <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No emails in the approval queue.</p>
          <p className="text-xs text-slate-600 mt-1">Run the pipeline on a lead to generate emails.</p>
        </Card>
      ) : (
        <>
          {generated.length > 0 && (
            <Card className="bg-slate-900/50 border-purple-500/20 overflow-hidden">
              <div className="p-3 border-b border-slate-800 bg-purple-500/5">
                <h3 className="text-sm font-medium text-purple-300">Awaiting Approval ({generated.length})</h3>
                <p className="text-[10px] text-slate-400">Review and approve before sending</p>
              </div>
              <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto font-sans">
                {generated.map(msg => (
                  <div key={msg.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <Badge variant="outline" className="text-[9px] h-4 bg-purple-500/15 text-purple-300 border-purple-500/30 mb-1">Seq #{msg.sequencePos}</Badge>
                        {editingId === msg.id ? (
                          <Input value={editSubject} onChange={e => setEditSubject(e.target.value)} className="bg-slate-800 border-slate-700 text-white h-7 text-xs mt-1" />
                        ) : (
                          <div className="text-sm font-medium text-white">{msg.subject}</div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">To: {msg.lead?.name} ({msg.lead?.email}) at {msg.lead?.company}</div>
                      </div>
                      <div className="flex gap-1.5 ml-3">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(msg)} className="h-7 text-xs text-slate-400 hover:text-white px-2"><Edit3 className="w-3 h-3 mr-1" />Edit</Button>
                        <Button size="sm" onClick={() => handleApprove(msg.id)} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2"><CheckCircle className="w-3 h-3 mr-1" />Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => approveMessage(msg.id)} className="h-7 text-xs text-red-400 hover:text-red-300 px-2"><XCircle className="w-3 h-3 mr-1" />Reject</Button>
                      </div>
                    </div>
                    {editingId === msg.id ? (
                      <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="bg-slate-800 border-slate-700 text-white text-xs min-h-[120px] resize-none mt-2" />
                    ) : (
                      <div className="text-xs text-slate-400 mt-2 whitespace-pre-wrap bg-slate-800/30 rounded p-2.5 line-clamp-6">{msg.body}</div>
                    )}
                    
                    {/* Render Citations & Evidence Snapshot */}
                    {renderEvidence(msg)}

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/50">
                      <div className="flex items-center gap-2 flex-wrap">
                        {msg.strategy && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-purple-300">{msg.strategy}</Badge>}
                        {msg.angle && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-cyan-300">{msg.angle}</Badge>}
                        {msg.tone && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-amber-300">{msg.tone}</Badge>}
                        {msg.cta && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-emerald-300">{msg.cta}</Badge>}
                      </div>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[9px] text-slate-400 hover:text-white px-1.5"
                        onClick={() => toggleReadiness(msg.id)}
                      >
                        <Shield className="w-2.5 h-2.5 mr-1" />
                        {readinessData[msg.id] ? 'Hide Safety report' : 'Show Safety report'}
                      </Button>
                    </div>

                    {/* Render Send Readiness Checklist */}
                    {renderReadiness(msg.id)}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {approved.length > 0 && (
            <Card className="bg-slate-900/50 border-emerald-500/20 overflow-hidden">
              <div className="p-3 border-b border-slate-800 bg-emerald-500/5">
                <h3 className="text-sm font-medium text-emerald-300">Approved — Ready to Send ({approved.length})</h3>
              </div>
              <div className="divide-y divide-slate-800/50 max-h-[400px] overflow-y-auto font-sans">
                {approved.map(msg => (
                  <div key={msg.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{msg.subject}</div>
                        <div className="text-[10px] text-slate-400">To: {msg.lead?.name} at {msg.lead?.company}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[9px] text-slate-400 hover:text-white px-1.5"
                          onClick={() => toggleReadiness(msg.id)}
                        >
                          <Shield className="w-2.5 h-2.5 mr-1" />
                          Safety Check
                        </Button>
                        <Button size="sm" onClick={() => sendMessage(msg.id)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3">
                          <Send className="w-3 h-3 mr-1" />Send
                        </Button>
                      </div>
                    </div>
                    
                    {/* Render Send Readiness Checklist */}
                    {renderReadiness(msg.id)}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
