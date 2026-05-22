'use client';

import { useDashboardStore, MessageRow } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Clock, CheckCircle, AlertCircle, Send, FileCheck } from 'lucide-react';

const STATUS_STYLES: Record<string, { icon: typeof Mail; color: string; bg: string }> = {
  draft: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/15' },
  generated: { icon: FileCheck, color: 'text-purple-400', bg: 'bg-purple-500/15' },
  approved: { icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  sent: { icon: Send, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  delivered: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  bounced: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/15' },
  replied: { icon: Mail, color: 'text-violet-400', bg: 'bg-violet-500/15' },
};

export function MessageLog() {
  const { messages } = useDashboardStore();

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 overflow-hidden">
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-white">All Messages</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">{messages.length} messages</p>
      </div>
      <ScrollArea className="max-h-[500px]">
        <div className="divide-y divide-slate-800/50">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No messages yet</div>
          ) : messages.map(msg => {
            const s = STATUS_STYLES[msg.status] || STATUS_STYLES.draft;
            const Icon = s.icon;
            return (
              <div key={msg.id} className="p-3 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                      <span className="text-xs font-medium text-white truncate">{msg.subject}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 bg-slate-700/50 text-slate-400 border-slate-600">#{msg.sequencePos}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{msg.lead?.name} ({msg.lead?.email}) at {msg.lead?.company}</div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] h-4 ml-2 ${s.bg} ${s.color} border-current/20`}>{msg.status}</Badge>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap bg-slate-800/30 rounded p-2">{msg.body}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {msg.strategy && <Badge variant="outline" className="text-[8px] h-3.5 border-slate-700 text-purple-300">{msg.strategy}</Badge>}
                  {msg.tone && <Badge variant="outline" className="text-[8px] h-3.5 border-slate-700 text-amber-300">{msg.tone}</Badge>}
                  {msg.cta && <Badge variant="outline" className="text-[8px] h-3.5 border-slate-700 text-emerald-300">{msg.cta}</Badge>}
                </div>
                {msg.followUps?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {msg.followUps.map(fu => (
                      <div key={fu.id} className="flex items-center gap-1.5 text-[9px] text-slate-500">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{fu.type} #{fu.sequencePos}</span>
                        <span>— {new Date(fu.scheduledAt).toLocaleDateString()}</span>
                        <Badge variant="outline" className={`text-[8px] h-3 ${fu.status === 'scheduled' ? 'border-amber-600/30 text-amber-400' : fu.status === 'cancelled' ? 'border-red-600/30 text-red-400' : 'border-slate-700 text-slate-500'}`}>{fu.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {msg.replies?.length > 0 && msg.replies.map(r => (
                  <div key={r.id} className="mt-1.5 p-1.5 rounded bg-violet-500/5 border border-violet-500/20 text-[9px] text-violet-300">
                    Reply: {r.category} ({(r.confidence * 100).toFixed(0)}%) — {r.replyText?.slice(0, 100)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
