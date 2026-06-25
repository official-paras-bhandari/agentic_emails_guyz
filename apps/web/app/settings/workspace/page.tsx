import React from 'react';
import { LayoutGrid, Server, Database, Activity, ShieldCheck } from 'lucide-react';

export default function WorkspaceSettings() {
  const workspaceId = process.env.INTERNAL_WORKSPACE_ID || 'ws_internal';
  const nodeEnv = process.env.NODE_ENV || 'development';
  const databaseUrl = process.env.DATABASE_URL || '';
  
  // Mask password in DB URL for security display
  const maskedDbUrl = databaseUrl ? databaseUrl.replace(/:([^:@]+)@/, ':••••••@') : 'Not Configured';

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-10 animate-spring-up">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/25">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">Workspace</h1>
            <p className="text-sm text-zinc-505 font-medium">View active server-side workspace configurations and runtime environment parameters.</p>
          </div>
        </div>
      </div>

      {/* Configuration Status Card */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex gap-4 items-center">
          <div className="p-3.5 bg-zinc-805/60 rounded-2xl border border-zinc-700/50">
            <Server className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Active Workspace Environment</h3>
            <p className="text-xs text-zinc-500">Deterministically routed context for multi-tenant data isolation.</p>
          </div>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
            <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Internal Workspace ID</span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-bold text-zinc-200">{workspaceId}</span>
              <span className="text-[9px] bg-blue-500/10 border border-blue-500/25 text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">Active</span>
            </div>
            <p className="text-[11px] text-zinc-650 leading-relaxed pt-1">
              Used as the partition key across all leads, campaigns, memories, and audit logs.
            </p>
          </div>

          <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
            <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Deployment Mode</span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200 capitalize">{nodeEnv}</span>
              <span className="text-[9px] bg-purple-500/10 border border-purple-500/25 text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">Runtime</span>
            </div>
            <p className="text-[11px] text-zinc-650 leading-relaxed pt-1">
              System flags and error tracking verbose policies adapt based on the deployment phase.
            </p>
          </div>
        </div>
      </div>

      {/* Database Integration Card */}
      <div className="glass-card rounded-2xl border border-zinc-800 bg-zinc-900/10 p-8 space-y-6">
        <div className="flex gap-4 items-center">
          <div className="p-3.5 bg-zinc-805/60 rounded-2xl border border-zinc-700/50">
            <Database className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Database Connection</h3>
            <p className="text-xs text-zinc-500">Prisma ORM connected to PostgreSQL database cluster.</p>
          </div>
        </div>

        <div className="h-[1px] bg-zinc-800" />

        <div className="p-5 bg-zinc-950/40 rounded-xl border border-zinc-800/40 space-y-2">
          <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">Connection URL</span>
          <div className="text-xs font-mono text-zinc-400 select-all truncate bg-black/40 border border-zinc-800 p-3 rounded-lg leading-relaxed">
            {maskedDbUrl}
          </div>
        </div>
      </div>

      {/* Guardrails Card */}
      <div className="glass-card rounded-2xl border border-zinc-800/50 bg-zinc-900/5 p-6 flex items-start gap-4">
        <ShieldCheck className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-zinc-450">
          <h4 className="font-bold text-zinc-300">Strict Workspace Guardrails</h4>
          <p className="leading-relaxed text-zinc-550">
            To prevent cross-workspace data leakage, all CRUD endpoints in this environment are guarded by a workspace middleware layer. Database records must match the workspace header ID before write, modification, or read access is authorized.
          </p>
        </div>
      </div>
    </div>
  );
}
