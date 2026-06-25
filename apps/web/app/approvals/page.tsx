'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Loader2, Check, X } from 'lucide-react';

type Draft = {
  id: string;
  subject: string;
  body: string;
  verificationScore?: number | null;
  verificationReasons: string[];
  lead: {
    businessName?: string | null;
    email?: string | null;
  };
};

function ApprovalsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [activePreviews, setActivePreviews] = useState<Record<string, { subject: string; body: string; instruction: string } | null>>({});
  const [loadingDraftId, setLoadingDraftId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const load = () => {
    const url = workspaceId 
      ? `/api/drafts?status=needs_review&workspaceId=${encodeURIComponent(workspaceId)}` 
      : '/api/drafts?status=needs_review';

    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error('Unable to load drafts');
        setDrafts(await r.json());
      })
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  const approve = async (id: string) => {
    try {
      const r = await fetch(`/api/drafts/${id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Approval failed');
        return;
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/drafts/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to discard draft');
    }
  };

  const handleRewriteOption = async (draftId: string, option: string) => {
    setLoadingDraftId(draftId);
    setOpenDropdownId(null);
    try {
      const r = await fetch(`/api/drafts/${draftId}/rewrite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, instruction: option, preview: true })
      });
      const data = await r.json();
      if (r.ok && data.status === 'success' && data.version) {
        setActivePreviews(prev => ({
          ...prev,
          [draftId]: {
            subject: data.version.subject,
            body: data.version.body,
            instruction: option
          }
        }));
      } else {
        setError(data.message || 'Failed to generate preview');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview');
    } finally {
      setLoadingDraftId(null);
    }
  };

  const applyPreview = async (draftId: string) => {
    const preview = activePreviews[draftId];
    if (!preview) return;
    setLoadingDraftId(draftId);
    try {
      const r = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          subject: preview.subject,
          body: preview.body,
          rewriteInstruction: preview.instruction
        })
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Failed to apply rewrite');
        return;
      }
      setActivePreviews(prev => ({ ...prev, [draftId]: null }));
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to apply rewrite');
    } finally {
      setLoadingDraftId(null);
    }
  };

  const cancelPreview = (draftId: string) => {
    setActivePreviews(prev => ({ ...prev, [draftId]: null }));
  };

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Draft Approvals</h1>
        <p className="text-zinc-500">Review verified content before it enters the send queue.</p>
      </div>
      
      {error && <p className="text-red-500 font-medium">{error}</p>}
      
      {drafts.map(d => (
        <article key={d.id} className="rounded-2xl border p-6 space-y-4 bg-white dark:bg-zinc-950">
          <div className="flex justify-between gap-4">
            <div>
              <h2 className="font-bold text-lg">{d.lead.businessName || d.lead.email}</h2>
              <p className="text-sm text-zinc-500">
                Score: {Math.round((d.verificationScore || 0) * 100)}%
              </p>
            </div>
            <div className="flex gap-2 items-center relative">
              <button 
                onClick={() => remove(d.id)} 
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
              >
                Skip
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setOpenDropdownId(openDropdownId === d.id ? null : d.id)}
                  disabled={loadingDraftId === d.id}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-sm font-medium flex items-center gap-2 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10"
                >
                  {loadingDraftId === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  AI Rewrite
                </button>
                {openDropdownId === d.id && (
                  <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border bg-white dark:bg-zinc-950 p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    {[
                      'Rewrite better',
                      'Make it shorter',
                      'Make it more friendly',
                      'Make it more personal',
                      'Make it less salesy',
                      'Focus on no-shows',
                      'Create follow-up',
                      'Create subject lines'
                    ].map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleRewriteOption(d.id, opt)}
                        className="w-full text-left rounded-lg px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={() => approve(d.id)} 
                className="rounded-xl bg-zinc-900 px-5 py-2 text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity text-sm font-medium"
              >
                Approve & queue
              </button>
            </div>
          </div>

          {activePreviews[d.id] ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-150 dark:border-zinc-850">
              <div className="space-y-2 opacity-60">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Original</span>
                </div>
                <b className="text-sm text-zinc-800 dark:text-zinc-200">{d.subject}</b>
                <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {d.body}
                </p>
              </div>
              <div className="space-y-2 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800 md:pl-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Preview: {activePreviews[d.id]?.instruction}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelPreview(d.id)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={() => applyPreview(d.id)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" /> Apply
                    </button>
                  </div>
                </div>
                <b className="text-sm text-zinc-800 dark:text-zinc-200">{activePreviews[d.id]?.subject}</b>
                <p className="whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
                  {activePreviews[d.id]?.body}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <b className="text-base text-zinc-800 dark:text-zinc-200">{d.subject}</b>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {d.body}
              </p>
            </div>
          )}

          {d.verificationReasons.length > 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 rounded-lg font-medium inline-block">
              {d.verificationReasons.join(' · ')}
            </p>
          )}
        </article>
      ))}
      
      {!drafts.length && !error && (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center text-zinc-500 font-medium bg-zinc-50/50 dark:bg-zinc-900/50">
          No drafts need review.
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading approvals...
      </div>
    }>
      <ApprovalsContent />
    </Suspense>
  );
}
