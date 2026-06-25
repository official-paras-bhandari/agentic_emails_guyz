'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, ListFilter, AlertOctagon, ArrowRight, Ban, CheckCircle2 } from 'lucide-react';

function ComplianceSettingsContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');
  const suppressionLink = workspaceId
    ? `/suppression-list?workspaceId=${encodeURIComponent(workspaceId)}`
    : '/suppression-list';

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-10 animate-spring-up">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/25">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">Compliance</h1>
            <p className="text-sm text-zinc-500 font-medium">Enforce unsubscribe intents, opt-out rules, and domain-level exclusion filters.</p>
          </div>
        </div>
      </div>

      {/* Suppression List Management Card */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex gap-4 items-center">
            <div className="p-3.5 bg-zinc-800/60 rounded-2xl border border-zinc-700/50">
              <ListFilter className="h-6 w-6 text-zinc-350" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">Global Suppression Directory</h3>
              <p className="text-xs text-zinc-505">Block individual email addresses or entire competitor domains from all outreach.</p>
            </div>
          </div>
          <Link
            href={suppressionLink}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-xs font-bold shadow-lg hover:shadow-blue-600/10 transition-all cursor-pointer select-none"
          >
            Manage suppression list
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-zinc-400">
          <div className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-1 flex gap-3.5 items-start">
            <Ban className="h-4.5 w-4.5 text-red-500/80 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-zinc-350">Email level suppression</h4>
              <p className="text-[11px] text-zinc-550 leading-relaxed font-medium">
                Blocks sends to specific addresses. Usually populated automatically upon detecting unsubscribe requests.
              </p>
            </div>
          </div>
          <div className="p-4 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-1 flex gap-3.5 items-start">
            <Ban className="h-4.5 w-4.5 text-red-500/80 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-zinc-350">Domain level suppression</h4>
              <p className="text-[11px] text-zinc-550 leading-relaxed font-medium">
                Prevents contacting any email hosted under blocked competitor domains, government, or high-risk domains.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rules Info Card */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex gap-4 items-center">
          <div className="p-3.5 bg-zinc-800/60 rounded-2xl border border-zinc-700/50">
            <AlertOctagon className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Outreach Guardrail Rules</h3>
            <p className="text-xs text-zinc-500">Enforced by backend node engines to secure compliance safety.</p>
          </div>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-400">
              <span className="font-bold text-zinc-350">Automated Reply Intent Detection</span>
              <p className="text-[11px] text-zinc-555 pt-0.5 leading-relaxed font-medium">
                AI agents scan thread replies. If unsubscribe sentiment or negative engagement is detected, the lead is immediately marked as unsubscribed and added to the suppression list.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-400">
              <span className="font-bold text-zinc-350">Campaign Safety Thresholds</span>
              <p className="text-[11px] text-zinc-555 pt-0.5 leading-relaxed font-medium">
                Maximum 4 follow-up steps are scheduled per contact campaign. No further messages will be sent once the lead replies or campaign limit is hit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComplianceSettings() {
  return (
    <Suspense fallback={
      <div className="p-10 max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-zinc-900 rounded-lg" />
        <div className="h-4 w-96 bg-zinc-900 rounded-lg" />
        <div className="h-60 bg-zinc-900 rounded-2xl mt-10" />
        <div className="h-60 bg-zinc-900 rounded-2xl" />
      </div>
    }>
      <ComplianceSettingsContent />
    </Suspense>
  );
}
