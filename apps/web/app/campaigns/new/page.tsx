'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronRight, Loader2, Sparkles, Globe, Terminal, ArrowRight, ArrowLeft, Send, RotateCcw, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

function NewCampaignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  
  // Step 1: Info
  const [name, setName] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [targetPersona, setTargetPersona] = useState('');
  
  // Step 2: Website
  const [businessWebsite, setBusinessWebsite] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  
  // Step 3: Crawling status
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('pending');
  const [logs, setLogs] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  
  // Step 4: Results
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [extractedDescription, setExtractedDescription] = useState('');
  const [extractedPersona, setExtractedPersona] = useState('');
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [deletedTemplateIds, setDeletedTemplateIds] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const clearWizardState = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('new_campaign_wizard_state');
    }
  };

  // Auto-scroll console logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Poll Job Status
  useEffect(() => {
    if (!jobId || step !== 3) return;

    let intervalId: any;
    const pollJob = async () => {
      try {
        const url = workspaceId 
          ? `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}` 
          : `/api/jobs/${jobId}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.job) {
          setJobStatus(data.job.status);
          setProgress(data.job.progress || 0);
        }
        
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
        }

        if (data.job.status === 'completed') {
          clearInterval(intervalId);
          fetchResults();
        } else if (data.job.status === 'failed') {
          clearInterval(intervalId);
          setError(data.job.failedReason || 'Website crawling and analysis failed.');
          setLoading(false);
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    };

    pollJob(); // initial call
    intervalId = setInterval(pollJob, 2000);

    return () => clearInterval(intervalId);
  }, [jobId, step, workspaceId]);

  const fetchResults = async () => {
    if (!campaignId) return;
    try {
      const url = workspaceId 
        ? `/api/campaigns/${campaignId}?workspaceId=${encodeURIComponent(workspaceId)}` 
        : `/api/campaigns/${campaignId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load campaign results');
      const data = await res.json();
      
      setExtractedDescription(data.businessDescription || '');
      setExtractedPersona(data.targetPersona || '');
      
      // Parse templates from campaignMemories
      if (Array.isArray(data.campaignMemories)) {
        const templates = data.campaignMemories
          .filter((m: any) => m.memoryType === 'email_template')
          .map((m: any) => {
            try {
              const parsed = JSON.parse(m.content);
              return {
                id: m.id,
                subject: parsed.subject || '',
                body: parsed.body || ''
              };
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        setEmailTemplates(templates);
      }
      
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch campaign results');
    }
  };

  // Load state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('new_campaign_wizard_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.step) setStep(parsed.step);
          if (parsed.name) setName(parsed.name);
          if (parsed.targetIndustry) setTargetIndustry(parsed.targetIndustry);
          if (parsed.targetLocation) setTargetLocation(parsed.targetLocation);
          if (parsed.targetPersona) setTargetPersona(parsed.targetPersona);
          if (parsed.businessWebsite) setBusinessWebsite(parsed.businessWebsite);
          if (parsed.businessDescription) setBusinessDescription(parsed.businessDescription);
          if (parsed.campaignId) setCampaignId(parsed.campaignId);
          if (parsed.jobId) setJobId(parsed.jobId);
          if (parsed.jobStatus) setJobStatus(parsed.jobStatus);
          if (parsed.progress) setProgress(parsed.progress);
          if (parsed.logs) setLogs(parsed.logs);
          if (parsed.extractedDescription) setExtractedDescription(parsed.extractedDescription);
          if (parsed.extractedPersona) setExtractedPersona(parsed.extractedPersona);
          
          if (Array.isArray(parsed.emailTemplates)) {
            setEmailTemplates(parsed.emailTemplates);
          } else if (parsed.step === 4 && parsed.campaignId) {
            fetchResults();
          }
          if (Array.isArray(parsed.deletedTemplateIds)) {
            setDeletedTemplateIds(parsed.deletedTemplateIds);
          }
        }
      } catch (e) {
        console.error('Error loading wizard state from localStorage:', e);
      }
    }
  }, []);

  // Save state to localStorage on any state change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const state = {
          step,
          name,
          targetIndustry,
          targetLocation,
          targetPersona,
          businessWebsite,
          businessDescription,
          campaignId,
          jobId,
          jobStatus,
          progress,
          logs,
          extractedDescription,
          extractedPersona,
          emailTemplates,
          deletedTemplateIds
        };
        localStorage.setItem('new_campaign_wizard_state', JSON.stringify(state));
      } catch (e) {
        console.error('Error saving wizard state to localStorage:', e);
      }
    }
  }, [
    step, name, targetIndustry, targetLocation, targetPersona,
    businessWebsite, businessDescription, campaignId, jobId,
    jobStatus, progress, logs, extractedDescription, extractedPersona,
    emailTemplates, deletedTemplateIds
  ]);
  const handleEditTemplate = (index: number, field: 'subject' | 'body', value: string) => {
    setEmailTemplates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddTemplate = () => {
    let subject = 'Follow-up Subject';
    let body = 'Hi there,\n\nJust following up on my previous note. Did you have a chance to look at it?\n\nBest,\nTeam';
    
    const count = emailTemplates.length;
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

    setEmailTemplates((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        subject,
        body
      }
    ]);
  };

  const handleDeleteTemplate = (index: number) => {
    const tmpl = emailTemplates[index];
    if (!tmpl.id.startsWith('new-')) {
      setDeletedTemplateIds((prev) => [...prev, tmpl.id]);
    }
    setEmailTemplates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAndConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Process deleted templates
      for (const id of deletedTemplateIds) {
        await fetch('/api/worker/memory', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'campaign',
            id,
            workspaceId
          })
        });
      }

      // 2. Process edited or new templates
      for (const tmpl of emailTemplates) {
        if (tmpl.id.startsWith('new-')) {
          // Create new template memory
          await fetch('/api/worker/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'campaign_memory',
              data: {
                workspaceId,
                campaignId,
                memoryType: 'email_template',
                content: JSON.stringify({ subject: tmpl.subject, body: tmpl.body })
              }
            })
          });
        } else {
          // Update existing template memory
          await fetch('/api/worker/memory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: tmpl.id,
              content: JSON.stringify({ subject: tmpl.subject, body: tmpl.body }),
              workspaceId
            })
          });
        }
      }

      clearWizardState();
      const url = workspaceId 
        ? `/campaigns/${campaignId}?workspaceId=${encodeURIComponent(workspaceId)}` 
        : `/campaigns/${campaignId}`;
      router.push(url);
    } catch (err: any) {
      setError(err.message || 'Failed to save templates');
    } finally {
      setLoading(false);
    }
  };
  const handleCreateAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !businessWebsite) return;
    
    setLoading(true);
    setError('');
    
    try {
      // 1. Create the campaign in the DB
      const campaignRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          targetIndustry,
          targetLocation,
          targetPersona,
          businessWebsite,
          businessDescription,
          status: 'draft',
          workspaceId
        })
      });

      if (!campaignRes.ok) {
        const errData = await campaignRes.json();
        throw new Error(errData.error || 'Failed to create campaign');
      }

      const campaignData = await campaignRes.json();
      const newCampaignId = campaignData.id;
      setCampaignId(newCampaignId);
      window.dispatchEvent(new Event('campaigns-updated'));

      // 2. Start the analysis job
      const analyzeRes = await fetch('/api/campaigns/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: newCampaignId,
          businessWebsite,
          workspaceId
        })
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'Failed to start business analysis');
      }

      const analyzeData = await analyzeRes.json();
      setJobId(analyzeData.jobId);
      
      // Go to crawling step
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!name) {
        setError('Campaign name is required');
        return;
      }
      setError('');
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    if (step === 2) {
      setStep(1);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-start p-6 md:p-12 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Wizard Card */}
      <div className="w-full max-w-4xl bg-zinc-950/40 backdrop-blur-2xl border border-zinc-800/80 rounded-3xl p-6 md:p-10 shadow-2xl relative z-10">
        
        {/* Header and Step Indicators */}
        <div className="mb-10">
          <div className="flex justify-between items-center mb-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">
                Step {step} of 4
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold mt-2 tracking-tight">
                {step === 1 && "Define Outreach Campaign"}
                {step === 2 && "Crawl Business Details"}
                {step === 3 && "Crawling & Analysis in Progress"}
                {step === 4 && "Review Extracted Brand Profile"}
              </h1>
            </div>
            {step < 3 && (
              <Link 
                onClick={clearWizardState}
                href={workspaceId ? `/campaigns?workspaceId=${encodeURIComponent(workspaceId)}` : "/campaigns"} 
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Cancel
              </Link>
            )}
          </div>

          {/* Step Progress Line */}
          <div className="flex items-center w-full gap-2 md:gap-4">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div 
                  className={`h-2 rounded-full flex-1 transition-all duration-500 ${
                    s <= step 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]' 
                      : 'bg-zinc-800'
                  }`}
                />
                {s < 4 && (
                  <ChevronRight className={`h-4 w-4 shrink-0 ${s < step ? 'text-blue-500' : 'text-zinc-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-900/30 bg-red-950/15 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: Campaign details */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Campaign Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Q3 SaaS Lead Acquisition"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Target Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Retail, Real Estate, Dental Clinics"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  value={targetIndustry}
                  onChange={(e) => setTargetIndustry(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Target Location</label>
                <input
                  type="text"
                  placeholder="e.g. Sydney, Australia"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Target Persona ("Who")</label>
                <input
                  type="text"
                  placeholder="e.g. Marketing Directors, Founders, CTOs"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  value={targetPersona}
                  onChange={(e) => setTargetPersona(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end pt-6">
              <button
                onClick={handleNextStep}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-[1.01]"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Website / Description */}
        {step === 2 && (
          <form onSubmit={handleCreateAndAnalyze} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Business Website URL *</label>
                <div className="flex items-center bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                  <Globe className="h-5 w-5 text-zinc-600 mr-3 shrink-0" />
                  <input
                    required
                    type="url"
                    placeholder="https://yourcompany.com"
                    className="w-full bg-transparent py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none"
                    value={businessWebsite}
                    onChange={(e) => setBusinessWebsite(e.target.value)}
                  />
                </div>
                <p className="text-xs text-zinc-500">We will crawl this website to auto-discover what your business does and draft target outreach emails.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Manual Business Description (Optional)</label>
                <textarea
                  rows={4}
                  placeholder="Provide context about what your business does, your values, or brand voice to guide the scraper and personalization agent."
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-zinc-800/40">
              <button
                type="button"
                onClick={handlePrevStep}
                className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 font-semibold px-4 py-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:scale-[1.01]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Preparing Agent...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-blue-200" />
                    <span>Start Crawling & Analysis</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Scanning radar & live logs */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in duration-300 flex flex-col items-center">
            
            {/* Premium Radar Scanning Animation */}
            <div className="relative w-44 h-44 flex items-center justify-center bg-zinc-950 rounded-full border border-blue-900/20 shadow-[inset_0_0_30px_rgba(59,130,246,0.05)] overflow-hidden">
              
              {/* Radar circles */}
              <div className="absolute inset-4 border border-dashed border-blue-800/20 rounded-full" />
              <div className="absolute inset-10 border border-solid border-blue-900/10 rounded-full" />
              <div className="absolute inset-20 border border-solid border-blue-900/20 rounded-full" />
              <div className="absolute inset-28 border border-dashed border-blue-800/10 rounded-full" />
              
              {/* Scanning Sweep */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-500/10 to-transparent origin-center rounded-full animate-[spin_4s_linear_infinite]" />
              
              {/* Pulse waves */}
              <div className="absolute h-2 w-2 bg-blue-500 rounded-full animate-ping" />
              <div className="absolute h-20 w-20 border border-blue-500/30 rounded-full animate-[ping_2s_ease-in-out_infinite]" />

              <div className="absolute text-center flex flex-col items-center">
                <Globe className="h-8 w-8 text-blue-400 animate-pulse mb-1" />
                <span className="text-[10px] font-mono text-blue-500 uppercase tracking-widest font-semibold">
                  Crawling
                </span>
              </div>
            </div>

            {/* Current progress bar */}
            <div className="w-full max-w-md space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Analysis Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Live Terminal Output Console */}
            <div className="w-full bg-[#0b0b0c] border border-zinc-800/80 rounded-2xl p-4 shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-zinc-850 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-mono text-zinc-500">Agent Console Logs</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
              </div>

              <div className="h-44 overflow-y-auto font-mono text-xs text-zinc-400 space-y-1.5 pr-2 custom-scrollbar">
                {logs.length === 0 ? (
                  <p className="text-zinc-600 italic">Initializing crawler workflow engine...</p>
                ) : (
                  logs.map((l: any, i) => (
                    <div key={i} className={`flex items-start gap-2 ${l.level === 'error' ? 'text-red-400' : 'text-zinc-300'}`}>
                       <span className="text-zinc-600 shrink-0 select-none">[{new Date(l.createdAt).toLocaleTimeString()}]</span>
                       <span className={l.level === 'error' ? 'font-bold' : ''}>{l.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>

            {/* Go Back & Retry buttons if failed */}
            {jobStatus === 'failed' && (
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setError('');
                    setJobStatus('pending');
                  }}
                  className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-semibold px-5 py-3 rounded-xl transition-all border border-zinc-800 cursor-pointer text-xs"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Go Back & Edit Details</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setJobStatus('pending');
                    setProgress(0);
                    setLogs([]);
                    try {
                      const analyzeRes = await fetch('/api/campaigns/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          campaignId,
                          businessWebsite,
                          workspaceId
                        })
                      });
                      if (!analyzeRes.ok) {
                        const errData = await analyzeRes.json();
                        throw new Error(errData.error || 'Failed to restart analysis');
                      }
                      const analyzeData = await analyzeRes.json();
                      setJobId(analyzeData.jobId);
                    } catch (err: any) {
                      setError(err.message || 'Failed to restart analysis');
                      setJobStatus('failed');
                    }
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-5 py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.15)] cursor-pointer text-xs"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Retry Analysis</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review extracted offer & blueprints */}
        {step === 4 && (
          <div className="space-y-8 animate-in fade-in duration-300">
            
            {/* Extracted context details */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-blue-500 flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Extracted Value Proposition
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed italic">
                  "{extractedDescription}"
                </p>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-blue-500 flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  Identified Target Persona
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {extractedPersona}
                </p>
              </div>
            </div>

            {/* Blueprint templates list */}
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Generated Outreach Blueprints ({emailTemplates.length})
                </h3>
                <button
                  type="button"
                  onClick={handleAddTemplate}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-400 cursor-pointer border border-blue-500/20 bg-blue-500/5 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Template</span>
                </button>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                {emailTemplates.map((tmpl, idx) => (
                  <div key={tmpl.id} className="bg-zinc-900/40 border border-zinc-850 hover:border-zinc-800 rounded-2xl p-5 shadow-lg relative flex flex-col pt-12">
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(idx)}
                      className="absolute top-4 left-4 p-0.5 text-zinc-500 hover:text-red-500 rounded transition-colors cursor-pointer"
                      title="Delete Template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute top-4 right-4 bg-zinc-800 text-[10px] text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                      Template {idx + 1}
                    </div>

                    <div className="space-y-3 flex-1">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Subject:</span>
                        <input
                          type="text"
                          value={tmpl.subject}
                          onChange={(e) => handleEditTemplate(idx, 'subject', e.target.value)}
                          className="w-full text-sm font-semibold text-zinc-200 bg-zinc-950/40 px-3 py-2 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Body:</span>
                        <textarea
                          value={tmpl.body}
                          onChange={(e) => handleEditTemplate(idx, 'body', e.target.value)}
                          rows={6}
                          className="w-full text-xs text-zinc-400 font-mono bg-zinc-950/40 p-3 rounded-lg border border-zinc-800 focus:outline-none focus:border-blue-500 transition-colors resize-none leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch Actions */}
            <div className="flex justify-end pt-6 border-t border-zinc-800/40">
              <button
                onClick={handleSaveAndConfirm}
                disabled={loading}
                className="flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-[0_0_25px_rgba(59,130,246,0.3)] hover:scale-[1.01] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Go to Campaign Dashboard</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default function NewCampaignWizard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading campaign setup...
      </div>
    }>
      <NewCampaignContent />
    </Suspense>
  );
}
