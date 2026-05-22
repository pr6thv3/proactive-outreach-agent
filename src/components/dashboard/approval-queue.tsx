'use client';

import { useDashboardStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Edit3, Send, Mail, Clock } from 'lucide-react';
import { useState } from 'react';

export function ApprovalQueue() {
  const { messages, approveMessage, sendMessage } = useDashboardStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

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
              <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto">
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
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {msg.strategy && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-purple-300">{msg.strategy}</Badge>}
                      {msg.angle && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-cyan-300">{msg.angle}</Badge>}
                      {msg.tone && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-amber-300">{msg.tone}</Badge>}
                      {msg.cta && <Badge variant="outline" className="text-[9px] h-4 border-slate-700 text-emerald-300">{msg.cta}</Badge>}
                    </div>
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
              <div className="divide-y divide-slate-800/50">
                {approved.map(msg => (
                  <div key={msg.id} className="p-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{msg.subject}</div>
                      <div className="text-[10px] text-slate-400">To: {msg.lead?.name} at {msg.lead?.company}</div>
                    </div>
                    <Button size="sm" onClick={() => sendMessage(msg.id)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 ml-3">
                      <Send className="w-3 h-3 mr-1" />Send (Dry Run)
                    </Button>
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
