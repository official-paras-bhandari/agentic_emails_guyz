'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, CheckCheck, Clock3, Copy, Inbox, Loader2, Mail, MessageSquareReply, RefreshCw } from 'lucide-react';

type ReplyRow = {
  id: string;
  threadId: string;
  content: string;
  classification: string;
  receivedAt: string;
  ageMinutes: number;
  userReplied: boolean;
  needsAttention: boolean;
  state: 'needs_reply' | 'waiting' | 'handled' | 'auto_resolved';
  lead: {
    businessName?: string | null;
    email?: string | null;
  };
};

function RepliesContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');

  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('Write a short, helpful reply that sounds natural and business-aware.');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const scope = showAll ? 'all' : 'open';
      const params = new URLSearchParams({ scope });
      if (workspaceId) params.set('workspaceId', workspaceId);
      const res = await fetch(`/api/replies?${params.toString()}`);
      if (!res.ok) throw new Error('Unable to load replies');
      const data = await res.json();
      const nextReplies = Array.isArray(data) ? data : [];
      setReplies(nextReplies);
      setSelectedId(current => {
        if (current && nextReplies.some(reply => reply.id === current)) return current;
        return nextReplies[0]?.id || null;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load replies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId, showAll]);

  useEffect(() => {
    setDraft(null);
    setDraftError('');
  }, [selectedId]);

  const syncNow = async () => {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/replies/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspaceId ? { workspaceId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync replies');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to sync replies');
    } finally {
      setSyncing(false);
    }
  };

  const selected = useMemo(
    () => replies.find(reply => reply.id === selectedId) || null,
    [replies, selectedId]
  );

  const generateDraft = async () => {
    if (!selected) return;
    setDraftLoading(true);
    setDraftError('');
    try {
      const res = await fetch(`/api/replies/${selected.id}/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(workspaceId ? { workspaceId, instruction } : { instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate reply');
      setDraft({ subject: data.subject, body: data.body });
    } catch (err: any) {
      setDraftError(err.message || 'Failed to generate reply');
    } finally {
      setDraftLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
  };

  return (
    <div className="min-h-full bg-[#09090b] text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
              <MessageSquareReply className="h-3.5 w-3.5" />
              Replies
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-zinc-50">Customer replies</h1>
            <p className="text-sm text-zinc-500 max-w-2xl">
              This shows synced customer messages that are still open or waiting. If you already replied in Gmail, the thread drops out automatically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAll(v => !v)}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              {showAll ? 'Show open only' : 'Show all'}
            </button>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync Gmail
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)_360px] gap-5 items-start">
          <aside className="rounded-3xl border border-zinc-800 bg-[#0b0b0c] overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
                <Inbox className="h-3.5 w-3.5" />
                List
              </div>
              <span className="text-[10px] font-semibold text-zinc-600">{replies.length}</span>
            </div>

            <div className="max-h-[calc(100vh-230px)] overflow-y-auto">
              {loading ? (
                <div className="flex h-64 items-center justify-center text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : replies.length === 0 ? (
                <div className="p-8 text-center space-y-3 text-zinc-500">
                  <Mail className="mx-auto h-10 w-10 text-zinc-700" />
                  <p className="font-semibold text-zinc-300">No replies to show</p>
                  <p className="text-sm">Sync Gmail, or switch to “Show all” to inspect handled threads.</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {replies.map(reply => {
                    const isActive = reply.id === selected?.id;
                    return (
                      <button
                        key={reply.id}
                        onClick={() => setSelectedId(reply.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                          isActive
                            ? 'border-blue-500/30 bg-blue-500/10'
                            : 'border-zinc-900 bg-zinc-950/40 hover:bg-zinc-900/70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-100">
                              {reply.lead.businessName || reply.lead.email || 'Unknown lead'}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                              {reply.content}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                            reply.needsAttention
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                              : reply.userReplied
                                ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                          }`}>
                            {reply.needsAttention ? 'Needs reply' : reply.userReplied ? 'Handled' : 'Waiting'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                          <span>{reply.classification}</span>
                          <span>{reply.ageMinutes}m ago</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="rounded-3xl border border-zinc-800 bg-[#0b0b0c] overflow-hidden">
            <div className="border-b border-zinc-900 px-5 py-4">
              {selected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                    <Mail className="h-3.5 w-3.5" />
                    Selected reply
                  </div>
                  <h2 className="text-2xl font-black text-zinc-50">
                    {selected.lead.businessName || selected.lead.email || 'Customer reply'}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    {selected.lead.email || 'No email'} · {new Date(selected.receivedAt).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="py-10 text-center text-zinc-500">
                  Select a reply to review it.
                </div>
              )}
            </div>

            {selected && (
              <div className="px-5 py-5 space-y-5">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    Customer message
                  </div>
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                    {selected.content}
                  </div>
                </div>

                {selected.userReplied ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
                    <CheckCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Already replied in Gmail</p>
                      <p className="text-blue-200/70 text-xs mt-0.5">This thread has a sent message after the customer reply.</p>
                    </div>
                  </div>
                ) : selected.needsAttention ? (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Needs a reply</p>
                      <p className="text-emerald-200/70 text-xs mt-0.5">This has been waiting more than 30 minutes.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                    <div>
                      <p className="font-semibold">Still waiting</p>
                      <p className="text-zinc-500 text-xs mt-0.5">This will appear here once it crosses the 30 minute mark.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-zinc-800 bg-[#0b0b0c] overflow-hidden">
            <div className="border-b border-zinc-900 px-5 py-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">
                <Bot className="h-3.5 w-3.5" />
                AI reply
              </div>
              <p className="mt-2 text-sm text-zinc-500">Write the reply with AI, then copy it into Gmail.</p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Instruction</span>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={7}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500/40 focus:ring-0"
                  placeholder="Tell AI how to reply..."
                />
              </label>

              <button
                onClick={generateDraft}
                disabled={!selected || draftLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                {draftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Draft reply
              </button>

              {draftError && (
                <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {draftError}
                </p>
              )}

              {draft ? (
                <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">Draft</p>
                    <button
                      onClick={copyDraft}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3">
                    <p className="text-xs font-semibold text-zinc-500">Subject</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{draft.subject}</p>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm leading-7 text-zinc-200">
                    {draft.body}
                  </pre>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/60 p-5 text-sm text-zinc-500">
                  Select a reply, draft a response, and paste it into Gmail.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function RepliesPage() {
  return (
    <Suspense fallback={<div className="min-h-[400px] flex items-center justify-center text-zinc-500">Loading replies...</div>}>
      <RepliesContent />
    </Suspense>
  );
}
