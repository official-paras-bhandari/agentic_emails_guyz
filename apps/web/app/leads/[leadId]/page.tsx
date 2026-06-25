'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Folder, FolderPlus, Loader2 } from 'lucide-react';
import Link from 'next/link';

type LeadGroup = {
  id: string;
  name: string;
};

function LeadDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const { leadId } = useParams<{ leadId: string }>();
  const [data, setData] = useState<any>();
  const [allGroups, setAllGroups] = useState<LeadGroup[]>([]);
  const [error, setError] = useState('');
  const [updatingGroup, setUpdatingGroup] = useState<string | null>(null);

  const loadLead = () => {
    const url = workspaceId
      ? `/api/leads/${leadId}?workspaceId=${encodeURIComponent(workspaceId)}`
      : `/api/leads/${leadId}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('Unable to load lead');
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  };

  const loadGroups = () => {
    const url = workspaceId
      ? `/api/leads/groups?workspaceId=${encodeURIComponent(workspaceId)}`
      : '/api/leads/groups';
    fetch(url)
      .then(async (r) => {
        if (r.ok) {
          setAllGroups(await r.json());
        }
      })
      .catch((e) => console.error('Failed to load groups:', e));
  };

  useEffect(() => {
    if (leadId) {
      loadLead();
      loadGroups();
    }
  }, [leadId, workspaceId]);

  const handleToggleGroup = async (groupId: string, currentlyInGroup: boolean) => {
    setUpdatingGroup(groupId);
    try {
      const endpoint = currentlyInGroup ? '/api/leads/groups/remove' : '/api/leads/groups/add';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, leadIds: [leadId], workspaceId }),
      });

      if (!r.ok) throw new Error('Failed to update group membership');
      loadLead(); // reload lead data
    } catch (err: any) {
      setError(err.message || 'Error updating group');
    } finally {
      setUpdatingGroup(null);
    }
  };

  const handleDeleteLead = async () => {
    if (!confirm('Are you sure you want to delete this lead? All associated email drafts, follow-ups, and logs will be permanently deleted.')) return;
    try {
      const url = workspaceId
        ? `/api/leads/${leadId}?workspaceId=${encodeURIComponent(workspaceId)}`
        : `/api/leads/${leadId}`;
      const r = await fetch(url, {
        method: 'DELETE',
      });
      if (!r.ok) throw new Error('Failed to delete lead');
      router.push(workspaceId ? `/leads?workspaceId=${encodeURIComponent(workspaceId)}` : '/leads');
    } catch (err: any) {
      setError(err.message || 'Failed to delete lead');
    }
  };

  const lead = data?.lead;
  const leadGroups = lead?.groups || [];

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      {/* Back Button */}
      <div className="flex justify-between items-center">
        <Link 
          href={workspaceId ? `/leads?workspaceId=${encodeURIComponent(workspaceId)}` : "/leads"} 
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 font-semibold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Lead Database</span>
        </Link>
        <button
          onClick={handleDeleteLead}
          className="text-xs bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 hover:border-red-900 text-red-400 font-bold px-3 py-1.5 rounded-xl transition-all"
        >
          Delete Lead
        </button>
      </div>

      {/* Title */}
      <div className="flex justify-between items-center border-b border-zinc-800/40 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{lead?.businessName || 'Lead Details'}</h1>
          {lead?.website && (
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
              {lead.website}
            </a>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
          lead?.status === 'scraped' 
            ? 'bg-blue-500/10 text-blue-500' 
            : lead?.status === 'duplicate' 
              ? 'bg-zinc-800 text-zinc-500' 
              : 'bg-green-500/10 text-green-500'
        }`}>
          {lead?.status}
        </span>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Grid details */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Contact status" value={lead?.status} />
        <Card title="Email" value={lead?.email || 'No email'} />
        <Card title="First Name" value={lead?.firstName || '—'} />
        <Card title="Last Name" value={lead?.lastName || '—'} />
        <Card title="Last contacted" value={lead?.sentEmails?.[0]?.sentAt ? new Date(lead.sentEmails[0].sentAt).toLocaleString() : 'Never'} />
        <Card title="Follow-ups" value={String(lead?.followUpTasks?.length || 0)} />
        <Card title="Reply status" value={lead?.replies?.[0]?.classification || 'No reply'} />
        <Card title="Sending policy" value={data?.policy?.sendNow?.allowed ? 'Allowed' : data?.policy?.sendNow?.reason || 'Checking'} />
      </div>

      {/* Lead Group Management */}
      <div className="border border-zinc-800 bg-zinc-950/10 rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-zinc-200">Group Memberships</h2>
          <span className="text-xs text-zinc-500">Assign tags to categorize this lead</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {allGroups.map((g) => {
            const isInGroup = leadGroups.some((lg: any) => lg.groupId === g.id);
            const isUpdating = updatingGroup === g.id;

            return (
              <button
                key={g.id}
                disabled={!!updatingGroup}
                onClick={() => handleToggleGroup(g.id, isInGroup)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border transition-all ${
                  isInGroup
                    ? 'bg-blue-600/10 text-blue-400 border-blue-500/30'
                    : 'bg-transparent text-zinc-550 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : (
                  <Folder className="h-3 w-3" />
                )}
                <span>{g.name}</span>
                <span className="text-[10px] opacity-70">
                  {isInGroup ? '✓' : '+'}
                </span>
              </button>
            );
          })}

          {allGroups.length === 0 && (
            <div className="text-zinc-500 text-xs italic flex items-center gap-1.5 py-2">
              <FolderPlus className="h-4 w-4" />
              <span>No groups found. Create groups on the main Leads page.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/20 p-5">
      <div className="text-xs uppercase text-zinc-500 font-bold tracking-wider">{title}</div>
      <div className="mt-2 font-semibold text-zinc-200">{value || '—'}</div>
    </div>
  );
}

export default function LeadPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading lead details...
      </div>
    }>
      <LeadDetailsContent />
    </Suspense>
  );
}
