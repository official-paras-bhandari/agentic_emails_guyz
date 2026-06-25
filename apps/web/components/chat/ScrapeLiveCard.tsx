"use client";

import React, { useState, useEffect } from "react";
import { Globe, Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, MapPin, Mail, Building2, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrapeEvent {
  step: "searching" | "visiting" | "opening_page" | "extracting" | "lead_found" | "duplicate_skipped" | "completed" | "failed";
  status: "running" | "success" | "failed" | "skipped";
  message: string;
  website_url?: string;
  current_url?: string;
  page_type?: string;
  extraction_location?: string;
  source_url?: string;
  business_name?: string;
  email?: string;
  suburb?: string;
  duplicate_reason?: string;
  timestamp?: number;
}

export function ScrapeLiveCard({ events }: { events: ScrapeEvent[] }) {
  const lastEvent = events[events.length - 1];
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (lastEvent?.status === "running") {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [lastEvent]);

  if (!lastEvent) return null;

  return (
    <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-2 w-2 rounded-full",
            lastEvent.status === "running" ? "bg-blue-500 animate-pulse" : 
            lastEvent.status === "success" ? "bg-emerald-500" : "bg-red-500"
          )} />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            Agent Status: {lastEvent.message}{lastEvent.status === "running" ? dots : ""}
          </span>
        </div>
        <div className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-500">
          {events.filter(e => e.step === 'lead_found').length} leads found
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Activity Feed (Granular) */}
        <div className="relative group">
          <div className="absolute inset-0 bg-blue-500/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative space-y-4">
            
            {/* Current Target URL */}
            <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl">
              <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                {lastEvent.step === "searching" ? <Search className="h-5 w-5 text-blue-400 animate-pulse" /> : <Globe className="h-5 w-5 text-emerald-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">Active Source</p>
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {lastEvent.website_url || lastEvent.current_url || "Search Engine"}
                </p>
              </div>
              {lastEvent.current_url && (
                <a href={lastEvent.current_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 text-zinc-600 hover:text-zinc-400 transition-colors" />
                </a>
              )}
            </div>

            {/* Extraction Details */}
            {(lastEvent.extraction_location || lastEvent.page_type) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-900/40 border border-zinc-800/50 p-3 rounded-xl flex items-center gap-2">
                  <MousePointer2 className="h-3 w-3 text-zinc-500" />
                  <span className="text-[11px] text-zinc-400 truncate">Page: {lastEvent.page_type || 'Main'}</span>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/50 p-3 rounded-xl flex items-center gap-2">
                  <Search className="h-3 w-3 text-zinc-500" />
                  <span className="text-[11px] text-zinc-400 truncate">Area: {lastEvent.extraction_location || 'Body'}</span>
                </div>
              </div>
            )}

            {/* Lead Found Highlight */}
            {lastEvent.step === 'lead_found' && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl animate-in zoom-in duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-500 uppercase">Extraction Success</h4>
                    <p className="text-sm font-bold text-zinc-100">{lastEvent.business_name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Mail className="h-3 w-3" />
                    <span className="text-zinc-200">{lastEvent.email}</span>
                  </div>
                  {lastEvent.suburb && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <MapPin className="h-3 w-3" />
                      <span className="text-zinc-200">{lastEvent.suburb}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Duplicate/Skipped Warning */}
            {lastEvent.step === 'duplicate_skipped' && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-500 uppercase">Duplicate Skipped</h4>
                    <p className="text-sm text-zinc-400">{lastEvent.email} already exists.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Ticker */}
        <div className="space-y-1.5 pt-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1">Live Agent Ticker</p>
          <div className="h-24 overflow-y-auto space-y-2 scrollbar-hide">
            {[...events].reverse().slice(0, 5).map((event, i) => (
              <div key={i} className={cn(
                "flex items-start gap-2 text-[10px] transition-all",
                i === 0 ? "text-zinc-100 opacity-100" : "text-zinc-600 opacity-50"
              )}>
                <div className={cn(
                  "mt-1.5 h-1 w-1 rounded-full shrink-0",
                  event.status === 'success' ? 'bg-emerald-500' : 
                  event.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-zinc-700'
                )} />
                <div className="min-w-0 flex-1">
                  <span className="font-bold opacity-70">[{new Date((event.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                  {" "}{event.message}
                  {event.source_url && <span className="block text-[9px] text-zinc-500 truncate">{event.source_url}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-zinc-800 flex items-center justify-center">
            <div className="h-1 w-1 rounded-full bg-zinc-600" />
          </div>
          <span className="text-[10px] text-zinc-500 font-medium">ScrapeGraphAI Protocol: v2.0 (Granular Tracking)</span>
        </div>
      </div>
    </div>
  );
}
