'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function FollowUpsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    const url = workspaceId 
      ? `/api/follow-ups?workspaceId=${encodeURIComponent(workspaceId)}` 
      : '/api/follow-ups';

    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error('Unable to load follow-ups');
        setItems(await r.json());
      })
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  const process = async () => {
    try {
      const r = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || 'Failed to process follow-ups');
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to process follow-ups');
    }
  };

  const skip = async (id: string) => {
    try {
      const r = await fetch(`/api/follow-ups/${id}/skip`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || 'Failed to skip follow-up');
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to skip follow-up');
    }
  };

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Follow-up Queue</h1>
          <p className="text-zinc-500">Policy-checked scheduled follow-ups.</p>
        </div>
        <button 
          onClick={process} 
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-white dark:bg-white dark:text-black font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Process due
        </button>
      </div>
      
      {error && <p className="text-red-500 font-medium">{error}</p>}
      
      <div className="space-y-3">
        {items.map(x => (
          <div key={x.id} className="flex items-center justify-between rounded-2xl border p-5 bg-white dark:bg-zinc-950">
            <div>
              <b className="text-base">{x.lead.businessName || x.lead.email}</b>
              <p className="text-sm text-zinc-500 mt-1">
                Step {x.stepNumber} · {new Date(x.scheduledFor).toLocaleString()} · {x.status}
              </p>
            </div>
            {['scheduled', 'ready'].includes(x.status) && (
              <button 
                onClick={() => skip(x.id)} 
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-sm font-medium"
              >
                Skip
              </button>
            )}
          </div>
        ))}
        
        {!items.length && (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center text-zinc-500 font-medium bg-zinc-50/50 dark:bg-zinc-900/50">
            No follow-ups scheduled.
          </div>
        )}
      </div>
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading follow-ups...
      </div>
    }>
      <FollowUpsContent />
    </Suspense>
  );
}
