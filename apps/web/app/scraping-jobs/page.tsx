"use client";

import React from "react";
import { Search, Loader2, CheckCircle, XCircle } from "lucide-react";

export default function ScrapingJobsPage() {
  return (
    <div className="p-10 max-w-5xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight premium-gradient-text">Scraping Jobs</h1>
        <p className="text-zinc-500 font-medium">Monitor and manage your active extraction tasks.</p>
      </div>

      <div className="space-y-4">
        <JobRow name="Sydney Salon Extraction" leads={41} status="active" progress={85} />
        <JobRow name="London Gym Search" leads={124} status="completed" progress={100} />
        <JobRow name="Melbourne Cafe List" leads={0} status="failed" progress={12} />
      </div>
    </div>
  );
}

function JobRow({ name, leads, status, progress }: any) {
  return (
    <div className="glass-card rounded-2xl p-6 flex items-center justify-between group">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          {status === 'active' ? <Loader2 className="h-5 w-5 animate-spin" /> : 
           status === 'completed' ? <CheckCircle className="h-5 w-5 text-green-500" /> : 
           <XCircle className="h-5 w-5 text-red-500" />}
        </div>
        <div>
          <h3 className="font-bold">{name}</h3>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{leads} Leads found</p>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="w-32 hidden md:block">
           <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-1000" style={{ width: `${progress}%` }} />
           </div>
        </div>
        <button className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all">
          View Details
        </button>
      </div>
    </div>
  );
}
