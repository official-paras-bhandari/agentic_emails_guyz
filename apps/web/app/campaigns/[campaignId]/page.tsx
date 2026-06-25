'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Play, Pause, Mail, CheckCircle, AlertCircle, FileText, Plus, Search, X,
  Square, CheckSquare, Loader2, Check, Sparkles, RefreshCw, Send, AlertTriangle, ExternalLink, Trash2,
  Clock, Zap, ChevronRight, Settings
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────
type GmailStatus = { connected: boolean; email: string | null; expired?: boolean };
type JobStatus = { status: string; failedReason?: string | null };
type PendingDraft = { id: string; subject: string; lead: { businessName?: string | null; email?: string | null } };

// ─── Gmail Status Banner ───────────────────────────────────────────────────────
function GmailBanner({ workspaceId }: { workspaceId: string | null }) {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);

  useEffect(() => {
    const url = workspaceId
      ? `/api/google/status?workspaceId=${encodeURIComponent(workspaceId)}`
      : '/api/google/status';
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGmail(data))
      .catch(() => {});
  }, [workspaceId]);

  if (!gmail || gmail.connected) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-300">Gmail not connected</p>
        <p className="text-amber-400/80 text-xs mt-0.5">
          Emails cannot be sent until you connect a Gmail account in Settings.
        </p>
      </div>
      <Link
        href={workspaceId ? `/settings?workspaceId=${encodeURIComponent(workspaceId)}` : '/settings'}
        className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-1.5 transition-colors"
      >
        <Settings className="h-3.5 w-3.5" />
        Connect
      </Link>
    </div>
  );
}

// ─── Live Job Status Card ───────────────────────────────────────────────────
function JobStatusCard({
  jobId,
  workspaceId,
}: {
  jobId: string;
  workspaceId: string | null;
}) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [polling, setPolling] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(() => {
    const url = workspaceId
      ? `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`
      : `/api/jobs/${jobId}`;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setJob(data.job);
        const done = ['completed', 'failed', 'cancelled'].includes(data.job?.status);
        if (done) {
          setPolling(false);
        }
      })
      .catch(() => {});
  }, [jobId, workspaceId]);

  useEffect(() => {
    fetchJob();
    if (polling) {
      intervalRef.current = setInterval(fetchJob, 4000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchJob, polling]);

  if (!job) return null;

  const isDone = ['completed', 'failed', 'cancelled'].includes(job.status);
  const isFailed = job.status === 'failed';
  const isRunning = !isDone;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm ${
      isFailed
        ? 'border-red-500/30 bg-red-500/10'
        : isRunning
          ? 'border-blue-500/30 bg-blue-500/10'
          : 'border-green-500/30 bg-green-500/10'
    }`}>
      {isFailed ? (
        <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
      ) : isRunning ? (
        <Loader2 className="h-5 w-5 shrink-0 text-blue-400 mt-0.5 animate-spin" />
      ) : (
        <CheckCircle className="h-5 w-5 shrink-0 text-green-400 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${isFailed ? 'text-red-300' : isRunning ? 'text-blue-300' : 'text-green-300'}`}>
          {isFailed
            ? 'Drafting failed — worker error'
            : isRunning
              ? 'AI is drafting personalised emails…'
              : 'Drafts are ready for review'}
        </p>
        {isFailed && job.failedReason && (
          <p className="text-red-400/80 text-xs mt-0.5 font-mono">{job.failedReason}</p>
        )}
        {!isFailed && (
          <p className={`text-xs mt-0.5 ${isRunning ? 'text-blue-400/80' : 'text-green-400/80'}`}>
            {isRunning
              ? 'The worker is enriching leads and writing emails. Reply handling lives in the Replies workspace.'
              : 'Campaign sends automatically when active. Replies and follow-ups are tracked separately.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Pending Drafts Panel ────────────────────────────────────────────────────
function PendingDraftsPanel({
  campaignId,
  workspaceId,
  onSent,
}: {
  campaignId: string;
  workspaceId: string | null;
  onSent: () => void;
}) {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; queued: number } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const url = workspaceId
      ? `/api/drafts?status=needs_review&workspaceId=${encodeURIComponent(workspaceId)}`
      : '/api/drafts?status=needs_review';
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        // Filter to only this campaign
        const campDrafts = (data as any[]).filter((d: any) => d.campaignId === campaignId);
        setDrafts(campDrafts.map((d: any) => ({
          id: d.id,
          subject: d.subject,
          lead: { businessName: d.lead?.businessName, email: d.lead?.email }
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [campaignId, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const approveAndSendAll = async () => {
    setSending(true);
    setError('');
    setSendResult(null);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/approve-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to approve and send');
      setSendResult({ queued: data.queued, sent: data.sendResult?.sent ?? 0 });
      load();
      onSent();
    } catch (err: any) {
      setError(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking for pending drafts…</span>
      </div>
    );
  }

  if (!drafts.length && !sendResult) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0b0b0c] overflow-hidden shadow-lg">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Mail className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div>
              <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                {drafts.length > 0
                ? `${drafts.length} email${drafts.length !== 1 ? 's' : ''} ready to send`
                : 'All emails processed'}
            </span>
            {drafts.length > 0 && (
              <p className="text-[10px] text-zinc-500 mt-0.5">Campaign activation sends them automatically; replies live in Replies</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={workspaceId ? `/replies?workspaceId=${encodeURIComponent(workspaceId)}` : '/replies'}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Replies
          </Link>
          {drafts.length > 0 && (
            <button
              onClick={approveAndSendAll}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-1.5 text-xs font-bold transition-all shadow-[0_0_12px_rgba(59,130,246,0.3)] disabled:cursor-not-allowed"
            >
              {sending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Sending…</span></>
              ) : (
                <><Send className="h-3.5 w-3.5" /><span>Approve &amp; Send All</span></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Send result */}
      {sendResult && (
        <div className="px-5 py-3 bg-green-500/5 border-b border-green-500/20 flex items-center gap-2 text-xs text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{sendResult.queued}</strong> email(s) approved &amp; queued.{' '}
            <strong>{sendResult.sent}</strong> sent immediately via Gmail.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 py-3 bg-red-500/5 border-b border-red-500/20 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Draft list */}
      {drafts.length > 0 && (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-900 max-h-60 overflow-y-auto">
          {drafts.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                <Mail className="h-3 w-3 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                  {d.lead.businessName || 'Unnamed Lead'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">{d.lead.email || '—'}</div>
              </div>
              <div className="text-[10px] text-zinc-500 truncate max-w-[200px] hidden sm:block">
                {d.subject}
              </div>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                Pending
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Campaign Content ─────────────────────────────────────────────────────
function CampaignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');

  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<any>();
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [editedSubjects, setEditedSubjects] = useState<Record<string, string>>({});
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [unsavedTemplateIds, setUnsavedTemplateIds] = useState<Set<string>>(new Set());

  const [activePreviews, setActivePreviews] = useState<Record<string, { subject: string; body: string; instruction: string } | null>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const [showAddLeadsModal, setShowAddLeadsModal] = useState(false);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [allLeads, setAllLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadsToAdd, setSelectedLeadsToAdd] = useState<string[]>([]);
  const [submittingLeads, setSubmittingLeads] = useState(false);
  const [modalError, setModalError] = useState('');
  const [leadGroups, setLeadGroups] = useState<any[]>([]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');

  // Job tracking after activation
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    if (showAddLeadsModal) {
      setLoadingLeads(true);
      setModalError('');
      const url = workspaceId
        ? `/api/leads?workspaceId=${encodeURIComponent(workspaceId)}`
        : `/api/leads`;
      fetch(url)
        .then(async (r) => {
          if (!r.ok) throw new Error('Failed to load leads list');
          setAllLeads(await r.json());
        })
        .catch((err) => setModalError(err.message))
        .finally(() => setLoadingLeads(false));

      const groupsUrl = workspaceId
        ? `/api/leads/groups?workspaceId=${encodeURIComponent(workspaceId)}`
        : `/api/leads/groups`;
      fetch(groupsUrl)
        .then(async (r) => { if (r.ok) setLeadGroups(await r.json()); })
        .catch((err) => console.error('Failed to load groups in modal:', err));
    }
  }, [showAddLeadsModal, workspaceId]);

  const handleAddLeads = async () => {
    if (isActive) {
      setModalError('Pause the campaign before adding new leads.');
      return;
    }
    if (selectedLeadsToAdd.length === 0) return;
    setSubmittingLeads(true);
    setModalError('');
    try {
      const results = await Promise.all(
        selectedLeadsToAdd.map(async (leadId) => {
            try {
              const r = await fetch(`/api/campaigns/${campaignId}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, workspaceId })
              });
              if (!r.ok) {
                const errData = await r.json().catch(() => ({ error: 'Request failed' }));
                const error = errData.error === 'campaign_active'
                  ? 'Pause the campaign before adding new leads.'
                  : errData.error || 'Failed to add';
                return { leadId, ok: false, error };
              }
              return { leadId, ok: true };
            } catch (err: any) {
              return { leadId, ok: false, error: err.message };
            }
        })
      );

      const failed = results.filter(res => !res.ok);
      if (failed.length > 0) {
        const leadNames = failed.map(f => {
          const lead = allLeads.find(l => l.id === f.leadId);
          return lead ? (lead.businessName || lead.email || 'Unnamed') : 'Unnamed';
        });
        setModalError(`Successfully added ${results.length - failed.length} leads. Failed to add ${failed.length} leads (${leadNames.join(', ')}). Reason: ${failed[0].error}`);
      } else {
        load();
        setShowAddLeadsModal(false);
        setSelectedLeadsToAdd([]);
      }
    } catch (err: any) {
      setModalError(err.message || 'An error occurred while adding leads');
    } finally {
      setSubmittingLeads(false);
    }
  };

  const handleSelectAllFiltered = (filteredList: any[]) => {
    const unaddedFilteredIds = filteredList
      .filter(l => !campaign?.campaignLeads?.some((cl: any) => cl.leadId === l.id))
      .map(l => l.id);

    const allSelected = unaddedFilteredIds.length > 0 && unaddedFilteredIds.every(id => selectedLeadsToAdd.includes(id));
    if (allSelected) {
      setSelectedLeadsToAdd(prev => prev.filter(id => !unaddedFilteredIds.includes(id)));
    } else {
      setSelectedLeadsToAdd(prev => Array.from(new Set([...prev, ...unaddedFilteredIds])));
    }
  };

  const load = useCallback(() => {
    const url = workspaceId
      ? `/api/campaigns/${campaignId}?workspaceId=${encodeURIComponent(workspaceId)}`
      : `/api/campaigns/${campaignId}`;

    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('Unable to load campaign');
        setCampaign(await r.json());
      })
      .catch((e) => setError(e.message));
  }, [campaignId, workspaceId]);

  useEffect(() => {
    if (campaignId) {
      void load();
    }
  }, [campaignId, workspaceId]);

  const updateStatus = async (next: string) => {
    try {
      const r = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, workspaceId }),
      });
      if (!r.ok) throw new Error('Failed to update status');
      const updated = await r.json();

      // Reload campaign
      load();

      // If just activated, the API returns activeJobId — use it directly
      if (next === 'active' && updated.activeJobId) {
        setActiveJobId(updated.activeJobId);
      }
    } catch (err: any) {
      setError(err.message || 'Error updating status');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!confirm('Delete this campaign? Campaign drafts, follow-ups, and campaign memories will be permanently deleted. Leads will remain in your workspace.')) return;

    try {
      const r = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({ error: 'Failed to delete campaign' }));
        throw new Error(errData.error || 'Failed to delete campaign');
      }
      router.push(workspaceId ? `/campaigns?workspaceId=${encodeURIComponent(workspaceId)}` : '/campaigns');
    } catch (err: any) {
      setError(err.message || 'Error deleting campaign');
    }
  };

  const handleRemoveLeadFromCampaign = async (leadId: string, leadName: string) => {
    if (!confirm(`Remove ${leadName} from this campaign? Pending sends and follow-ups for this lead will be cancelled, but the lead record will stay in your workspace.`)) return;

    try {
      const r = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, leadId }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({ error: 'Failed to remove lead' }));
        throw new Error(errData.error || 'Failed to remove lead');
      }
      load();
    } catch (err: any) {
      setError(err.message || 'Error removing lead');
    }
  };

  // Find the highest quality draft
  const highestQualityDraft = campaign?.drafts?.length
    ? [...campaign.drafts].sort((a: any, b: any) => (b.verificationScore || 0) - (a.verificationScore || 0))[0]
    : null;

  // Find the associated lead for the highest quality draft
  const showcaseLead = highestQualityDraft
    ? campaign?.campaignLeads?.find((cl: any) => cl.leadId === highestQualityDraft.leadId)?.lead
    : null;

  useEffect(() => {
    if (campaign?.campaignMemories) {
      const blueprintTemplates = campaign.campaignMemories
        .filter((m: any) => m.memoryType === 'email_template')
        .map((m: any) => {
          try {
            const parsed = JSON.parse(m.content);
            return { id: m.id, subject: parsed.subject, body: parsed.body };
          } catch {
            return null;
          }
        })
        .filter(Boolean) || [];
      setTemplates(blueprintTemplates);
    }
  }, [campaign]);

  const handleAddTemplate = async () => {
    let subject = 'Follow-up Subject';
    let body = 'Hi there,\n\nJust following up on my previous note. Did you have a chance to look at it?\n\nBest,\nTeam';

    const count = templates.length;
    if (count === 0) {
      subject = 'Quick question regarding your business operations';
      body = 'Hi {{first_name}},\n\nI was looking at {{company_name}}\'s website and noticed you have a stellar list of professional services. \n\nWe\'ve been working on a new strategy to streamline client scheduling. Before putting it live, I wanted to ask: would it be alright if I sent over a 2-minute overview of how this can automate bookings?\n\nNo pressure at all, just wanted to check first.\n\nBest regards,\n{{sender_name}}';
    } else if (count === 1) {
      subject = 'Re: Quick question regarding your business operations';
      body = 'Hi {{first_name}},\n\nI know you\'re busy running things, so I wanted to bump this to the top of your inbox. \n\nI actually did a quick review of your page loading times and noticed a few tweaks that could help prevent client drop-off. If the timing is right, I\'d be happy to share those details.\n\nBest,\n{{sender_name}}';
    } else if (count === 2) {
      subject = 'Case study: 30% increase in local bookings';
      body = 'Hi {{first_name}},\n\nThought you might appreciate this: we recently helped a business similar to {{company_name}} increase their monthly appointments by 30% by optimizing booking flows.\n\nWe\'ve also worked with respected service brands in your region to implement the same setup.\n\nIf you\'d like to see how we did it, let me know and I can send over the case study.\n\nThanks,\n{{sender_name}}';
    } else if (count === 3) {
      subject = 'Re: Case study: 30% increase in local bookings';
      body = 'Hi {{first_name}},\n\nSince I haven\'t heard back, I\'ll assume that optimizing booking automation isn\'t a priority for {{company_name}} right now. Completely understand!\n\nIf anything changes or if you ever want to revisit this, feel free to reach out. Otherwise, this is the last you\'ll hear from me.\n\nWishing you the best of luck!\n\nBest regards,\n{{sender_name}}';
    } else {
      subject = 'Final check-in';
      body = 'Hi {{first_name}},\n\nJust wanted to send one last note in case our previous emails got buried. If you ever need help with automated scheduling/outreach in the future, we\'d love to connect.\n\nAll the best,\n{{sender_name}}';
    }

    try {
      const res = await fetch('/api/worker/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'campaign_memory',
          data: { workspaceId, campaignId, memoryType: 'email_template', content: JSON.stringify({ subject, body }) }
        })
      });
      if (res.ok) load();
    } catch (err) {
      console.error('Failed to add template:', err);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const res = await fetch('/api/worker/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'campaign', id, workspaceId })
      });
      if (res.ok) load();
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const handleSaveTemplate = async (id: string, subject: string, body: string) => {
    try {
      const res = await fetch('/api/worker/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: JSON.stringify({ subject, body }), workspaceId })
      });
      if (res.ok) load();
    } catch (err) {
      console.error('Failed to save template:', err);
    }
  };

  const simulateTemplateRewrite = (subject: string, body: string, option: string) => {
    let newSubject = subject;
    let newBody = body;
    const opt = option.toLowerCase();

    if (opt.includes('shorter')) {
      newBody = `Hi there,\n\nI wanted to see if improving your customer follow-up and booking workflow is a priority. We help similar businesses automate this.\n\nWould you be open to a quick chat next week?\n\nBest,\nAzura team`;
    } else if (opt.includes('friendly') || opt.includes('friendlier')) {
      newBody = `Hi team! 👋\n\nHope you're having an amazing week! I was checking out your website and absolutely love what you do.\n\nI wanted to reach out because we help teams automate follow-ups and keep customer bookings full. If you're open to it, I'd love to share a few tips that might help you save some time.\n\nLet me know if you'd like to chat! 😊\n\nBest,\nAzura team`;
    } else if (opt.includes('personal') || opt.includes('more personal')) {
      newBody = `Hi there,\n\nI was looking at your business page and was really impressed by your customer reviews. I wanted to reach out directly to see how you're currently handling follow-ups for bookings.\n\nWe build simple tools to help businesses like yours run follow-ups automatically so you can focus on your clients. Would you be open to a 2-minute overview?\n\nBest,\nAzura team`;
    } else if (opt.includes('salesy') || opt.includes('less sales')) {
      newBody = `Hi there,\n\nI noticed your website and wanted to check if you're currently looking for ways to streamline your booking process.\n\nI write about outreach and automation for local businesses and wanted to share a free resource if you're interested. Let me know if that sounds useful.\n\nBest,\nAzura team`;
    } else if (opt.includes('no-show') || opt.includes('no show') || opt.includes('no-shows')) {
      newSubject = `Quick idea for no-show prevention`;
      newBody = `Hi there,\n\nI came across your business website and wanted to share a quick idea on how to reduce client no-shows by up to 80% using automated text/email reminders.\n\nWe've helped local service providers recover thousands in lost bookings with simple follow-ups. Would you be interested in seeing how it works?\n\nBest,\nAzura team`;
    } else if (opt.includes('follow-up') || opt.includes('follow up')) {
      newSubject = `Checking in: Customer bookings`;
      newBody = `Hi there,\n\nI sent you a quick note earlier about automating client follow-ups and wanted to see if that's something on your radar this quarter.\n\nIf you have 5 minutes, I can show you how other teams are saving 10+ hours a week on scheduling. Let me know if you have time to connect.\n\nBest,\nAzura team`;
    } else if (opt.includes('subject') || opt.includes('subject lines')) {
      newSubject = `Alternative Subject Lines`;
      newBody = `1. Quick question about bookings\n2. 10x your client retention?\n3. Automated follow-up idea for your team`;
    } else {
      newBody = `Hi there,\n\nI was browsing your website and noticed some areas where automating client booking confirmations and follow-ups could save your team significant time.\n\nWe work with service businesses to implement simple outreach tools that keep schedules full. Are you open to a brief chat to explore this?\n\nBest,\nAzura team`;
    }

    return { subject: newSubject, body: newBody };
  };

  const applyPreview = async (id: string) => {
    const preview = activePreviews[id];
    if (!preview) return;
    await handleSaveTemplate(id, preview.subject, preview.body);
    setActivePreviews(prev => ({ ...prev, [id]: null }));
  };

  const cancelPreview = (id: string) => {
    setActivePreviews(prev => ({ ...prev, [id]: null }));
  };

  const isActive = campaign?.status === 'active';
  const hasPendingLeads = (campaign?.campaignLeads?.length ?? 0) > 0;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      {/* Back button */}
      <div>
        <Link
          href={workspaceId ? `/campaigns?workspaceId=${encodeURIComponent(workspaceId)}` : "/campaigns"}
          className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-350 dark:hover:text-zinc-300 font-semibold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Campaigns</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/40 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{campaign?.name || 'Campaign Details'}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              campaign?.status === 'active'
                ? 'bg-green-500/10 text-green-500'
                : campaign?.status === 'draft'
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-zinc-805 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {campaign?.status}
            </span>
            {campaign?.businessWebsite && (
              <span className="text-xs text-zinc-500">· {campaign.businessWebsite}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {campaign?.status !== 'active' ? (
            <button
              onClick={() => setShowActivateConfirm(true)}
              disabled={!hasPendingLeads}
              title={!hasPendingLeads ? 'Add at least one lead before activating' : undefined}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-all shadow-[0_0_10px_rgba(34,197,94,0.15)]"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Activate</span>
            </button>
          ) : (
            <button
              onClick={() => updateStatus('paused')}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 bg-zinc-950/20 text-zinc-700 dark:text-zinc-300 px-4 py-2.5 text-sm font-semibold transition-all"
            >
              <Pause className="h-4 w-4" />
              <span>Pause</span>
            </button>
          )}

          <button
            onClick={handleDeleteCampaign}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 px-4 py-2.5 text-sm font-semibold transition-all"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* ── SYSTEM STATUS SECTION ────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Gmail connection warning */}
        <GmailBanner workspaceId={workspaceId} />

        {/* Live job status (shown after activation) */}
        {activeJobId && (
          <JobStatusCard
            jobId={activeJobId}
            workspaceId={workspaceId}
          />
        )}

        {(isActive || activeJobId) && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0b0b0c] px-5 py-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Campaign is live</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Once active, the system sends automatically. Customer replies are surfaced in the Replies workspace.
                </p>
              </div>
              <Link
                href={workspaceId ? `/replies?workspaceId=${encodeURIComponent(workspaceId)}` : '/replies'}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                Open Replies
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Showcase Section */}
      {highestQualityDraft && (
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Personalized Email Showcase
          </h2>

          <div className="bg-white dark:bg-[#0b0b0c] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl">
            {/* Mock Mail Window Header */}
            <div className="bg-zinc-50 dark:bg-zinc-900/40 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                <span className="text-xs text-zinc-500 font-mono ml-4">Mock Email Client</span>
              </div>

              <div className="bg-blue-600/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider">
                Personalization Quality: {Math.round(highestQualityDraft.verificationScore * 100)}%
              </div>
            </div>

            {/* Email Metadata */}
            <div className="p-4 border-b border-zinc-150 dark:border-zinc-850 space-y-2 text-xs">
              <div className="flex">
                <span className="text-zinc-500 w-12 font-semibold">To:</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                  {showcaseLead
                    ? `${showcaseLead.businessName || 'Lead'} <${showcaseLead.email || 'no-email@domain.com'}>`
                    : '{{leadEmail}}'
                  }
                </span>
              </div>
              <div className="flex">
                <span className="text-zinc-500 w-12 font-semibold">Subject:</span>
                <span className="text-zinc-800 dark:text-zinc-200 font-semibold">
                  {highestQualityDraft.subject}
                </span>
              </div>
            </div>

            {/* Email Body */}
            <div className="p-6 text-sm text-zinc-650 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed min-h-[160px] bg-zinc-50/20 dark:bg-zinc-950/20">
              {highestQualityDraft.body}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Outreach Blueprint Sequence Editor */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Campaign Outreach Blueprint
        </h2>

        <div className="space-y-6">
          {templates.map((t, idx) => {
            const hasPreview = !!activePreviews[t.id];
            const preview = activePreviews[t.id];

            return (
              <article key={t.id} className="rounded-2xl border p-6 bg-white dark:bg-[#0b0b0c] border-zinc-200 dark:border-zinc-800/80 shadow-lg space-y-4 text-left">
                {/* Step Header */}
                <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-900">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2.5 py-1 rounded-full">
                      {idx === 0 ? 'Initial Outreach' : `Follow-up #${idx}`}
                    </span>
                  </div>
                  <div className="flex gap-2 relative">
                    {/* Delete button (for followups only) */}
                    {idx > 0 && (
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="text-xs text-red-500 hover:text-red-400 font-semibold px-2 py-1"
                      >
                        Delete Step
                      </button>
                    )}

                    {/* AI Rewrite dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === t.id ? null : t.id)}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-xs font-medium flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        AI Rewrite
                      </button>
                      {openDropdownId === t.id && (
                        <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border bg-white dark:bg-zinc-950 p-2 shadow-lg">
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
                              onClick={() => {
                                const res = simulateTemplateRewrite(t.subject, t.body, opt);
                                setActivePreviews(prev => ({
                                  ...prev,
                                  [t.id]: { subject: res.subject, body: res.body, instruction: opt }
                                }));
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Template Content */}
                {hasPreview ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50/50 dark:bg-zinc-900/10 p-4 rounded-xl border border-zinc-150 dark:border-zinc-850">
                    <div className="space-y-1.5 opacity-60">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Original</span>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">{t.subject}</div>
                      <div className="text-xs text-zinc-650 dark:text-zinc-350 whitespace-pre-wrap leading-relaxed">{t.body}</div>
                    </div>
                    <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800 md:pl-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Preview: {preview?.instruction}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => cancelPreview(t.id)} className="text-xs text-zinc-500 hover:underline">
                            Cancel
                          </button>
                          <button onClick={() => applyPreview(t.id)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
                            Apply
                          </button>
                        </div>
                      </div>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">{preview?.subject}</div>
                      <div className="text-xs text-zinc-650 dark:text-zinc-350 whitespace-pre-wrap leading-relaxed font-semibold">{preview?.body}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Subject:</span>
                      <input
                        type="text"
                        value={editedSubjects[t.id] !== undefined ? editedSubjects[t.id] : t.subject}
                        onChange={(e) => {
                          setEditedSubjects(prev => ({ ...prev, [t.id]: e.target.value }));
                          setUnsavedTemplateIds(prev => new Set(prev).add(t.id));
                        }}
                        className="w-full text-sm font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-50/50 dark:bg-zinc-950/20 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">Body:</span>
                      <textarea
                        value={editedBodies[t.id] !== undefined ? editedBodies[t.id] : t.body}
                        onChange={(e) => {
                          setEditedBodies(prev => ({ ...prev, [t.id]: e.target.value }));
                          setUnsavedTemplateIds(prev => new Set(prev).add(t.id));
                        }}
                        rows={5}
                        className="w-full text-xs text-zinc-650 dark:text-zinc-350 bg-zinc-50/50 dark:bg-zinc-950/20 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 focus:outline-none focus:border-blue-500 resize-none leading-relaxed font-mono"
                      />
                    </div>
                    {unsavedTemplateIds.has(t.id) && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            const subj = editedSubjects[t.id] !== undefined ? editedSubjects[t.id] : t.subject;
                            const bdy = editedBodies[t.id] !== undefined ? editedBodies[t.id] : t.body;
                            handleSaveTemplate(t.id, subj, bdy);
                            setUnsavedTemplateIds(prev => {
                              const next = new Set(prev);
                              next.delete(t.id);
                              return next;
                            });
                          }}
                          className="rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-black px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {/* Add Follow-up Button */}
          {templates.length < 5 && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleAddTemplate}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 cursor-pointer border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 rounded-xl transition-all animate-pulse"
              >
                <Plus className="h-4 w-4" />
                <span>Add Follow-up Step</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card label="Leads" value={campaign?.campaignLeads?.length} />
        <Card label="Drafts" value={campaign?.drafts?.length} />
        <Card
          label="Pending Approval"
          value={campaign?.drafts?.filter((d: any) => d.status === 'needs_review').length}
          highlight={campaign?.drafts?.filter((d: any) => d.status === 'needs_review').length > 0}
        />
        <Card label="Follow-ups" value={campaign?.followUpTasks?.length} />
      </div>

      {/* Leads Table */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Campaign Leads</h3>
          <button
            onClick={() => {
              if (isActive) {
                setError('Pause the campaign before adding more leads.');
                return;
              }
              setShowAddLeadsModal(true);
            }}
            disabled={isActive}
            title={isActive ? 'Pause the campaign before adding more leads' : undefined}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 cursor-pointer border border-blue-500/20 bg-blue-500/5 px-3.5 py-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Leads</span>
          </button>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-850 overflow-hidden bg-white dark:bg-zinc-950/15">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/40 border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="p-3.5">Lead</th>
                <th className="p-3.5">Email</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-150 dark:divide-zinc-850">
              {campaign?.campaignLeads?.map((x: any) => (
                <tr key={x.leadId} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors">
                  <td className="p-3.5 font-semibold text-zinc-800 dark:text-zinc-200">{x.lead.businessName || 'Unnamed business'}</td>
                  <td className="p-3.5 text-zinc-500 dark:text-zinc-450">{x.lead.email || '—'}</td>
                  <td className="p-3.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      x.status === 'active'
                        ? 'bg-blue-500/10 text-blue-500'
                        : x.status === 'completed'
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-500 dark:text-zinc-400'
                    }`}>
                      {x.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => handleRemoveLeadFromCampaign(x.leadId, x.lead.businessName || x.lead.email || 'this lead')}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </td>
                </tr>
              ))}

              {!campaign?.campaignLeads?.length && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-zinc-500">
                    <Mail className="mx-auto mb-2 h-6 w-6 text-zinc-400 dark:text-zinc-650" />
                    <p className="font-semibold text-zinc-700 dark:text-zinc-400">No leads in this campaign</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {isActive
                        ? 'Pause the campaign first, then add new leads.'
                        : 'Click "Add Leads" above or go to the Leads page to add targets.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ADD LEADS MODAL ──────────────────────────────────────────── */}
      {showAddLeadsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg border border-zinc-800 bg-[#09090b] rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-zinc-150">Add Leads to Campaign</h3>
              </div>
              <button
                onClick={() => { setShowAddLeadsModal(false); setSelectedLeadsToAdd([]); }}
                className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-zinc-350 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4 flex flex-col min-h-0">
              {modalError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Search & Filter row */}
              <div className="flex gap-2 shrink-0 flex-wrap">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-zinc-850 bg-zinc-950/20 px-3.5 focus-within:border-blue-500 transition-all">
                  <Search className="h-4 w-4 text-zinc-500" />
                  <input
                    className="w-full bg-transparent py-2.5 text-xs outline-none placeholder-zinc-650 text-zinc-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search leads by name, email, website..."
                  />
                </div>

                <select
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-250 focus:outline-none focus:border-blue-500 max-w-[150px]"
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                >
                  <option value="all">All Groups</option>
                  {leadGroups.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Select All Filtered Action */}
              {!loadingLeads && allLeads.length > 0 && (
                <div className="flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const filteredList = allLeads.filter(l => {
                        const matchText = `${l.businessName || ''} ${l.firstName || ''} ${l.lastName || ''} ${l.email || ''} ${l.website || ''}`.toLowerCase();
                        const matchesSearch = matchText.includes(searchQuery.toLowerCase());
                        if (selectedGroupFilter !== 'all') {
                          return matchesSearch && l.groups?.some((g: any) => g.groupId === selectedGroupFilter);
                        }
                        return matchesSearch;
                      });
                      handleSelectAllFiltered(filteredList);
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 cursor-pointer"
                  >
                    {(() => {
                      const filteredList = allLeads.filter(l => {
                        const matchText = `${l.businessName || ''} ${l.firstName || ''} ${l.lastName || ''} ${l.email || ''} ${l.website || ''}`.toLowerCase();
                        const matchesSearch = matchText.includes(searchQuery.toLowerCase());
                        if (selectedGroupFilter !== 'all') {
                          return matchesSearch && l.groups?.some((g: any) => g.groupId === selectedGroupFilter);
                        }
                        return matchesSearch;
                      });
                      const unaddedFilteredIds = filteredList
                        .filter(l => !campaign?.campaignLeads?.some((cl: any) => cl.leadId === l.id))
                        .map(l => l.id);
                      const allSelected = unaddedFilteredIds.length > 0 && unaddedFilteredIds.every(id => selectedLeadsToAdd.includes(id));
                      return allSelected ? "Deselect All Filtered" : "Select All Filtered";
                    })()}
                  </button>
                </div>
              )}

              {/* Leads List */}
              <div className="flex-1 overflow-y-auto border border-zinc-900 rounded-2xl bg-zinc-950/10 min-h-[200px] p-2 custom-scrollbar space-y-1">
                {loadingLeads ? (
                  <div className="h-32 flex flex-col items-center justify-center text-zinc-500 text-xs">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500 mb-2" />
                    <span>Loading leads...</span>
                  </div>
                ) : (() => {
                  const filteredLeads = allLeads.filter(l => {
                    const matchText = `${l.businessName || ''} ${l.firstName || ''} ${l.lastName || ''} ${l.email || ''} ${l.website || ''}`.toLowerCase();
                    const matchesSearch = matchText.includes(searchQuery.toLowerCase());
                    if (selectedGroupFilter !== 'all') {
                      return matchesSearch && l.groups?.some((g: any) => g.groupId === selectedGroupFilter);
                    }
                    return matchesSearch;
                  });

                  if (filteredLeads.length === 0) {
                    return (
                      <div className="h-32 flex items-center justify-center text-zinc-600 text-xs italic">
                        No leads found
                      </div>
                    );
                  }

                  return filteredLeads.map(l => {
                    const isAlreadyAdded = campaign?.campaignLeads?.some((cl: any) => cl.leadId === l.id);
                    const isChecked = selectedLeadsToAdd.includes(l.id);

                    return (
                      <div
                        key={l.id}
                        onClick={() => {
                          if (isAlreadyAdded) return;
                          if (isChecked) {
                            setSelectedLeadsToAdd(selectedLeadsToAdd.filter(id => id !== l.id));
                          } else {
                            setSelectedLeadsToAdd([...selectedLeadsToAdd, l.id]);
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                          isAlreadyAdded
                            ? 'opacity-40 cursor-not-allowed bg-zinc-900/10'
                            : 'hover:bg-zinc-900/40 cursor-pointer'
                        } ${isChecked ? 'bg-blue-900/5' : ''}`}
                      >
                        <div className="min-w-0 flex-1 pr-4">
                          <div className="text-xs font-semibold text-zinc-250 truncate">{l.businessName || 'Unnamed Business'}</div>
                          <div className="text-[10px] text-zinc-550 truncate mt-0.5">{l.email || 'No Email'} · {l.website || 'No Website'}</div>
                        </div>

                        <div>
                          {isAlreadyAdded ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">
                              Added
                            </span>
                          ) : (
                            <button type="button" className="text-zinc-500 hover:text-zinc-350 transition-colors">
                              {isChecked ? (
                                <CheckSquare className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-between items-center bg-zinc-950/20 shrink-0">
              <span className="text-xs text-zinc-500 font-medium">
                {selectedLeadsToAdd.length} leads selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddLeadsModal(false); setSelectedLeadsToAdd([]); }}
                  className="rounded-xl border border-zinc-850 hover:bg-zinc-900/30 px-4 py-2 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedLeadsToAdd.length === 0 || submittingLeads}
                  onClick={handleAddLeads}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2 text-xs transition-all shadow-[0_0_10px_rgba(59,130,246,0.15)] flex items-center gap-1.5"
                >
                  {submittingLeads ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Adding...</span></>
                  ) : (
                    <><Check className="h-3.5 w-3.5" /><span>Add {selectedLeadsToAdd.length} Leads</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVATE CONFIRMATION MODAL ──────────────────────────────── */}
      {showActivateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowActivateConfirm(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
            {/* Top gradient accent */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-teal-500" />

            <div className="p-7 pt-8 space-y-5">
              {/* Icon + heading */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <Play className="h-5 w-5 fill-green-500 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 leading-snug">
                    Start this campaign?
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    The AI will draft personalised emails. Once you activate the campaign, sends happen automatically.
                  </p>
                </div>
              </div>

              {/* What happens checklist */}
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 p-4 space-y-3">
                {([
                  { icon: '🤖', text: 'AI drafts personalised emails for each lead' },
                  { icon: '✉️', text: 'When active, the campaign sends automatically' },
                  { icon: '🔁', text: 'Smart follow-ups scheduled automatically (up to 4)' },
                  { icon: '🚫', text: 'Unsubscribe requests are respected automatically' },
                ] as { icon: string; text: string }[]).map(({ icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <span className="text-base leading-none mt-0.5">{icon}</span>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 leading-snug">{text}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-zinc-400 dark:text-zinc-600">
                You can pause the campaign at any time from this page.
              </p>

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowActivateConfirm(false)}
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-4 py-2.5 text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowActivateConfirm(false); updateStatus('active'); }}
                  className="flex-1 rounded-xl bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 text-sm font-bold transition-all shadow-[0_0_16px_rgba(34,197,94,0.25)] flex items-center justify-center gap-2"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Yes, Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading campaign details...
      </div>
    }>
      <CampaignContent />
    </Suspense>
  );
}

function Card({ label, value, highlight = false }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-zinc-950/20 p-5 ${
      highlight
        ? 'border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5'
        : 'border-zinc-200 dark:border-zinc-800'
    }`}>
      <div className={`text-xs uppercase font-bold tracking-wider ${highlight ? 'text-amber-500' : 'text-zinc-500'}`}>
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold ${highlight ? 'text-amber-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
        {value ?? '0'}
      </div>
    </div>
  );
}
