"use client";

import React from "react";
import { Bot, Activity, ShieldCheck, Zap } from "lucide-react";

export default function AgentSwarmPage() {
  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight premium-gradient-text">Agent Swarm</h1>
          <p className="text-zinc-500 font-medium">Manage and monitor your autonomous agent fleet.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-500 rounded-full text-xs font-bold uppercase tracking-widest">
          <Activity className="h-3 w-3" />
          8 Agents Active
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AgentCard name="Command-01" type="Orchestrator" status="idle" />
        <AgentCard name="Scraper-A" type="ScrapeGraphAI" status="active" />
        <AgentCard name="Scraper-B" type="ScrapeGraphAI" status="active" />
        <AgentCard name="Enricher-01" type="Lead Enrichment" status="idle" />
        <AgentCard name="Writer-01" type="Email Generation" status="idle" />
        <AgentCard name="Safety-01" type="Compliance Guard" status="locked" />
      </div>
    </div>
  );
}

function AgentCard({ name, type, status }: any) {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-tighter">
          {status}
        </div>
      </div>
      <div>
        <h3 className="font-bold">{name}</h3>
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">{type}</p>
      </div>
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
        <span>Uptime: 14d 2h</span>
        <Zap className="h-3 w-3" />
      </div>
    </div>
  );
}
