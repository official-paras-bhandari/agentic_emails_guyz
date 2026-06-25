'use client';

import Link from 'next/link';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Folder } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  status: string;
  verificationMode: string;
  dailySendLimit: number;
  _count: {
    campaignLeads: number;
    drafts: number;
    followUpTasks: number;
  };
};

function CampaignsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    const url = workspaceId 
      ? `/api/campaigns?workspaceId=${encodeURIComponent(workspaceId)}` 
      : '/api/campaigns';

    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('Unable to load campaigns');
        setItems(await r.json());
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, [workspaceId]);

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/40 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Campaigns</h1>
          <p className="text-zinc-500 mt-1">Control verification, sending, and follow-up sequences.</p>
        </div>
        <div>
          <Link
            href={workspaceId ? `/campaigns/new?workspaceId=${encodeURIComponent(workspaceId)}` : '/campaigns/new'}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 text-sm font-semibold transition-all shadow-[0_0_15px_rgba(59,130,246,0.2)]"
          >
            <Plus className="h-4 w-4" />
            <span>Create Campaign</span>
          </Link>
        </div>
      </div>

      {error && <p className="text-red-500">{error}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((c) => (
          <Link
            key={c.id}
            href={workspaceId ? `/campaigns/${c.id}?workspaceId=${encodeURIComponent(workspaceId)}` : `/campaigns/${c.id}`}
            className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/20 p-5 hover:border-blue-500/50 dark:hover:bg-zinc-950/40 transition-all"
          >
            <div className="flex justify-between items-start">
              <h2 className="font-bold text-lg group-hover:text-blue-500 transition-colors dark:group-hover:text-blue-400">{c.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                c.status === 'active' 
                  ? 'bg-green-500/10 text-green-500' 
                  : c.status === 'draft' 
                    ? 'bg-amber-500/10 text-amber-500' 
                    : 'bg-zinc-800 text-zinc-400'
              }`}>
                {c.status}
              </span>
            </div>
            
            <div className="mt-6 grid grid-cols-3 text-sm border-t border-zinc-150 dark:border-zinc-800/40 pt-4 text-zinc-600 dark:text-zinc-400">
              <div>
                <div className="text-xs text-zinc-450 dark:text-zinc-500">Leads</div>
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">{c._count.campaignLeads}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-450 dark:text-zinc-500">Drafts</div>
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">{c._count.drafts}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-450 dark:text-zinc-500">Follow-ups</div>
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 mt-0.5">{c._count.followUpTasks}</div>
              </div>
            </div>

            <div className="mt-4 flex justify-end items-center text-xs text-zinc-450 dark:text-zinc-500">
              <span>{c.dailySendLimit} emails/day</span>
            </div>
          </Link>
        ))}

        {items.length === 0 && (
          <div className="md:col-span-2 text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
            <Folder className="h-10 w-10 text-zinc-400 dark:text-zinc-650 mx-auto" />
            <h3 className="text-base font-bold">No campaigns yet</h3>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto">Create a campaign to automatically crawl websites and generate personalized outreach email drafts.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading campaigns...
      </div>
    }>
      <CampaignsContent />
    </Suspense>
  );
}
