'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail, Shield, CheckCircle2, AlertTriangle, RefreshCw, LogOut, ExternalLink, Inbox } from 'lucide-react';

function GoogleSettingsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const [state, setState] = useState<{ connected: boolean; connection?: any; hasCredentials?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchState = async () => {
    try {
      setLoading(true);
      const url = workspaceId
        ? `/api/google/connect?status=1&workspaceId=${encodeURIComponent(workspaceId)}`
        : '/api/google/connect?status=1';
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        setState(data);
      }
    } catch (e) {
      console.error("Failed to load Google connection status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [workspaceId]);

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google & Gmail? This will cancel or block all queued outreach emails in this workspace.")) return;
    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      if (response.ok) {
        fetchState();
      }
    } catch (e) {
      console.error("Failed to disconnect", e);
    }
  };

  const connectUrl = workspaceId
    ? `/api/google/connect?workspaceId=${encodeURIComponent(workspaceId)}`
    : '/api/google/connect';

  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <RefreshCw className="h-8 w-8 text-zinc-550 animate-spin" />
        <p className="text-sm text-zinc-500">Loading integration state...</p>
      </div>
    );
  }

  const isConnected = state?.connected;
  const hasCredentials = state?.hasCredentials;

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-10 animate-spring-up">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/25">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">Google & Gmail</h1>
            <p className="text-sm text-zinc-500 font-medium">Connect and manage your Google accounts for automated outreach sending and replies.</p>
          </div>
        </div>
      </div>

      {/* Warnings & Alerts */}
      {!hasCredentials && (
        <div className="glass-card border border-amber-500/30 bg-amber-500/5 rounded-2xl p-6 flex gap-4 items-start">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-amber-500">Google OAuth Credentials Missing</h3>
            <p className="text-xs text-zinc-400 leading-relaxed font-medium">
              Google OAuth client keys are not configured in your backend server environment. To connect your Google account, you must define the following variables in your <code className="text-zinc-300 bg-zinc-800/80 px-1 py-0.5 rounded">.env</code> files:
            </p>
            <div className="bg-black/40 rounded-xl p-3 border border-zinc-800 text-[10px] font-mono text-zinc-400 space-y-1">
              <div>GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com</div>
              <div>GOOGLE_CLIENT_SECRET=your_client_secret</div>
              <div>GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback</div>
            </div>
            <p className="text-xs text-zinc-555 font-medium">
              For complete guides on setting up your credentials, please refer to the <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5 font-bold">Google Cloud Console <ExternalLink className="h-3 w-3" /></a>.
            </p>
          </div>
        </div>
      )}

      {/* Gmail Connection Card */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex gap-4 items-center">
            <div className="p-3.5 bg-zinc-800/60 rounded-2xl border border-zinc-700/50">
              <Inbox className="h-6 w-6 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">Gmail Send & Reply Integrations</h3>
              <p className="text-xs text-zinc-500 font-medium">Allows the agent to send approved drafts and sync thread replies.</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              isConnected 
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/25' 
                : 'bg-zinc-805 text-zinc-500 border border-zinc-700/50'
            }`}>
              {isConnected ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </>
              ) : 'Not Connected'}
            </span>
          </div>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        {isConnected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Connected Account</span>
                <p className="text-sm font-semibold text-zinc-200">{state.connection?.gmailAddress}</p>
              </div>
              <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-1">
                <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Connected Since</span>
                <p className="text-sm font-semibold text-zinc-200">
                  {state.connection?.connectedAt ? new Date(state.connection.connectedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '-'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleDisconnect}
                className="rounded-xl border border-zinc-850 hover:border-red-500/30 hover:bg-red-500/5 px-4 py-2.5 text-xs font-semibold text-zinc-355 hover:text-red-500 transition-all flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Disconnect Account
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-zinc-400">
              <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <span className="text-xs font-bold text-zinc-400">01</span>
                </div>
                <h4 className="text-xs font-bold text-zinc-200">Gmail Sending</h4>
                <p className="text-[11px] text-zinc-500 leading-normal font-medium">
                  Automatically dispatch personalized email outreach messages to verified leads.
                </p>
              </div>
              <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <span className="text-xs font-bold text-zinc-400">02</span>
                </div>
                <h4 className="text-xs font-bold text-zinc-200">Reply Synchronization</h4>
                <p className="text-[11px] text-zinc-550 leading-normal font-medium">
                  Auto-sync incoming replies to detect positive engagement or unsubscribe intents.
                </p>
              </div>
              <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <span className="text-xs font-bold text-zinc-400">03</span>
                </div>
                <h4 className="text-xs font-bold text-zinc-200">Follow-up Sequences</h4>
                <p className="text-[11px] text-zinc-550 leading-normal font-medium">
                  Schedule up to 4 follow-up steps if leads remain unresponsive, all managed dynamically.
                </p>
              </div>
            </div>

            <div className="flex justify-start">
              <a
                href={hasCredentials ? connectUrl : undefined}
                className={`rounded-xl px-5 py-3 text-xs font-bold tracking-wide shadow-lg transition-all flex items-center gap-2 ${
                  hasCredentials 
                    ? 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-600/10 cursor-pointer' 
                    : 'bg-zinc-850 text-zinc-500 cursor-not-allowed border border-zinc-800'
                }`}
                onClick={(e) => {
                  if (!hasCredentials) {
                    e.preventDefault();
                    alert("Please configure Google OAuth Credentials in the server env variables first.");
                  }
                }}
              >
                <Mail className="h-4.5 w-4.5" />
                Connect Gmail Account
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Security Info Card */}
      <div className="glass-card rounded-2xl border border-zinc-800/50 bg-zinc-900/5 p-6 flex items-start gap-4">
        <Shield className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-zinc-450">
          <h4 className="font-bold text-zinc-300">Security & Encryption Policy</h4>
          <p className="leading-relaxed text-zinc-550">
            Your privacy and account safety are important. Google Access & Refresh tokens are encrypted locally at rest using a 32-byte secret key and AES-256-GCM. We only request permissions necessary for Gmail outreach (sending and checking replies). We will never read your other emails or share your personal data.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GoogleSettings() {
  return (
    <Suspense fallback={
      <div className="p-10 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <RefreshCw className="h-8 w-8 text-zinc-500 animate-spin" />
        <p className="text-sm text-zinc-500">Loading Google settings...</p>
      </div>
    }>
      <GoogleSettingsContent />
    </Suspense>
  );
}
