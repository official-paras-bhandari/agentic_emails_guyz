'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, Clock, PlayCircle, Eye, CheckCircle2, RefreshCw, Save } from 'lucide-react';

function SendingSettingsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  
  const [dailySendLimit, setDailySendLimit] = useState(100);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const url = workspaceId
          ? `/api/workspace/settings?workspaceId=${encodeURIComponent(workspaceId)}`
          : '/api/workspace/settings';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setDailySendLimit(data.dailySendLimit ?? 100);
            setDelaySeconds(data.delaySeconds ?? 30);
          }
        }
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [workspaceId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSuccess(false);
      const res = await fetch('/api/workspace/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          dailySendLimit,
          delaySeconds
        })
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save settings", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <RefreshCw className="h-8 w-8 text-zinc-550 animate-spin" />
        <p className="text-sm text-zinc-500">Loading safety configuration...</p>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-10 animate-spring-up">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/25">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">Sending Safety</h1>
            <p className="text-sm text-zinc-500 font-medium">Protect your sender reputation with automated rate limits and queue checks.</p>
          </div>
        </div>
      </div>

      {/* Constraints Dashboard - Form Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily Send Limit */}
        <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PlayCircle className="h-4.5 w-4.5 text-blue-500" />
              <span className="text-xs font-bold text-zinc-205">Daily Dispatch Limit</span>
            </div>
            <span className="text-[10px] bg-blue-500/10 border border-blue-500/25 text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">
              {dailySendLimit} emails
            </span>
          </div>
          
          <div className="space-y-3 pt-2">
            <input 
              type="range" 
              min="1" 
              max="500" 
              value={dailySendLimit} 
              onChange={(e) => setDailySendLimit(Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase">
              <span>1 email</span>
              <span>500 emails</span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed font-medium">
            The maximum number of emails sent across all campaigns in this workspace per 24-hour cycle.
          </p>
        </div>

        {/* Delay Between Dispatches */}
        <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-purple-550" />
              <span className="text-xs font-bold text-zinc-205">Dispatch Spacing</span>
            </div>
            <span className="text-[10px] bg-purple-500/10 border border-purple-500/25 text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">
              {delaySeconds} Seconds
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <input 
              type="range" 
              min="0" 
              max="300" 
              value={delaySeconds} 
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase">
              <span>0s (Instant)</span>
              <span>300s (5m)</span>
            </div>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed font-medium">
            A cooling-off period injected between consecutive emails in the queue. Simulates natural human behavior and mitigates risk of account throttling.
          </p>
        </div>
      </div>

      {/* Save Button Row */}
      <div className="flex justify-end gap-3 items-center">
        {success && (
          <span className="text-xs font-bold text-emerald-500 animate-fade-in flex items-center gap-1.5 mr-2">
            <CheckCircle2 className="h-4 w-4" />
            Settings saved successfully!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 text-xs font-bold shadow-lg hover:shadow-blue-600/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 select-none"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Guardrail Settings
        </button>
      </div>

      {/* Safety Policy Checklist */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex gap-4 items-center">
          <div className="p-3.5 bg-zinc-800/60 rounded-2xl border border-zinc-700/50">
            <Eye className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-205">Pre-Flight Safety Checks</h3>
            <p className="text-xs text-zinc-500">Every draft is validated against these deterministic rules immediately before send.</p>
          </div>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        <div className="space-y-4 text-zinc-400">
          <div className="flex gap-3.5 items-start">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-zinc-300">Unsubscribe & Suppression List Validation</h4>
              <p className="text-[11px] text-zinc-550 leading-relaxed font-medium">
                Matches the recipient's email address and domain against your global workspace suppression records.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 items-start">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-zinc-300">Lead Contact Policy Enforcement</h4>
              <p className="text-[11px] text-zinc-550 leading-relaxed font-medium">
                Prevents multi-campaign collision. Ensures the lead hasn't been contacted in the last 30 days.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5 items-start">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-zinc-300">Queue Leases & Anti-Double Send Lock</h4>
              <p className="text-[11px] text-zinc-550 leading-relaxed font-medium">
                Acquires an exclusive database lease ownership for dispatch candidates. Guarantees zero duplicate sends.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SendingSettings() {
  return (
    <Suspense fallback={
      <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <RefreshCw className="h-8 w-8 text-zinc-500 animate-spin" />
        <p className="text-sm text-zinc-500">Loading safety configuration...</p>
      </div>
    }>
      <SendingSettingsContent />
    </Suspense>
  );
}
