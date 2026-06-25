"use client";

import React from "react";
import { Brain, Info, History, AlertTriangle } from "lucide-react";

export function LeadDetailPanel({ lead, memories }: { lead: any; memories: any[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-5 w-5 text-zinc-900 dark:text-zinc-100" />
        <h2 className="text-lg font-bold">Business Intelligence</h2>
      </div>

      <div className="grid gap-4">
        <MemorySection 
          title="Business Facts" 
          icon={<Info className="h-4 w-4" />}
          items={memories.filter(m => m.memoryType === "business_fact")}
        />
        <MemorySection 
          title="Personalization Points" 
          icon={<Brain className="h-4 w-4 text-purple-500" />}
          items={memories.filter(m => m.memoryType === "personalization_point")}
        />
        <MemorySection 
          title="Past Interactions" 
          icon={<History className="h-4 w-4 text-blue-500" />}
          items={memories.filter(m => m.memoryType === "past_contact" || m.memoryType === "reply_summary")}
        />
        <MemorySection 
          title="Risk & Fit Notes" 
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          items={memories.filter(m => m.memoryType === "risk_note" || m.memoryType === "fit_note")}
        />
      </div>
    </div>
  );
}

function MemorySection({ title, icon, items }: { title: string; icon: React.ReactNode; items: any[] }) {
  if (items.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{title}</span>
      </div>
      <div className="space-y-2">
        {items.map((m, i) => (
          <div key={i} className="text-sm text-zinc-700 dark:text-zinc-300">
            {m.content}
            {m.sourceUrl && (
              <a href={m.sourceUrl} target="_blank" className="ml-2 text-[10px] text-zinc-400 hover:underline">Source</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
