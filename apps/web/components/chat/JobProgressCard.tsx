"use client";

import React from "react";
import { CheckCircle2, Compass, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
}

interface ScrapeEvent {
  step: string;
  status: string;
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

interface JobProgressCardProps {
  jobName: string;
  steps: Step[];
  progress: number;
  failedReason?: string;
  isMockMode?: boolean;
  events?: ScrapeEvent[];
}

export function JobProgressCard({ jobName, steps, progress, failedReason, isMockMode, events = [] }: JobProgressCardProps) {
  // Overall workflow status
  const isWorkflowCompleted = steps.length > 0 && steps.every(s => s.status === "completed");
  const isWorkflowFailed = !!failedReason || steps.some(s => s.status === "failed");

  // Get active step index to show loading indicator
  const activeStepIndex = steps.findIndex(s => s.status === "running");

  // Filter page visits and extraction events to show as sub-nodes
  const visitEvents = events.filter(e => 
    e.step === "visiting" || 
    e.step === "opening_page" || 
    e.step === "extracting"
  );

  // Extract unique domains visited
  const visitedDomains = Array.from(new Set(
    visitEvents
      .map(e => e.website_url || e.current_url || "")
      .filter(url => url.length > 0)
      .map(url => url.replace(/https?:\/\/(www\.)?/, "").split("/")[0])
  ));

  return (
    <div className="w-full pl-0 space-y-4">
      {/* Steps List */}
      <div className="space-y-3.5">
        {steps.map((step, idx) => {
          const isPending = step.status === "pending";
          const isRunning = step.status === "running";
          const isCompleted = step.status === "completed";
          const isFailed = step.status === "failed";

          // Format step title to look identical to the screenshot
          let displayTitle = step.name;
          if (step.name.toLowerCase() === "understanding") {
            displayTitle = "Understand requirements and outline plan";
          } else if (step.name.toLowerCase() === "searching") {
            displayTitle = `Search for leads and collect website URLs`;
          } else if (step.name.toLowerCase() === "extracting" || step.name.toLowerCase() === "extraction") {
            displayTitle = `Visit each website and extract contact info`;
          }

          return (
            <div key={step.id || idx} className="space-y-2">
              <div className="flex items-start gap-3">
                {/* Step Icon */}
                <div className="mt-0.5 shrink-0">
                  {isCompleted && (
                    <CheckCircle2 className="h-4.5 w-4.5 text-zinc-500 fill-zinc-900/50" />
                  )}
                  {isRunning && (
                    <div className="h-4.5 w-4.5 rounded-full border-2 border-zinc-400 border-t-zinc-100 animate-spin" />
                  )}
                  {isFailed && (
                    <AlertCircle className="h-4.5 w-4.5 text-red-500" />
                  )}
                  {isPending && (
                    <div className="h-4.5 w-4.5 rounded-full border border-zinc-800 bg-[#0c0c0e] flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
                    </div>
                  )}
                </div>

                {/* Step Title */}
                <div className="flex-1">
                  <span className={cn(
                    "text-[13px] leading-relaxed transition-colors",
                    isCompleted && "text-zinc-500",
                    isRunning && "text-zinc-100 font-medium",
                    isFailed && "text-red-500 font-medium",
                    isPending && "text-zinc-600"
                  )}>
                    {displayTitle}
                  </span>
                </div>
              </div>

              {/* Sub-items (Visited URLs) shown directly under the active running step */}
              {isRunning && visitedDomains.length > 0 && (
                <div className="pl-7 space-y-2 animate-in fade-in duration-300">
                  {visitedDomains.map((domain, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <div className="h-4.5 w-4.5 rounded-full bg-[#161618] border border-[#232326] flex items-center justify-center shrink-0">
                        <Compass className="h-2.5 w-2.5 text-zinc-400" />
                      </div>
                      <span className="truncate">
                        Extract email addresses from the contact pages of the identified salons. <strong className="text-zinc-300 font-medium">{domain}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error alert if failed */}
      {failedReason && (
        <div className="mt-2 p-3 bg-red-950/20 border border-red-900/30 rounded-2xl flex items-start gap-2.5 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold uppercase tracking-wider text-[10px]">Execution Error</p>
            <p className="mt-0.5 font-medium leading-relaxed">{failedReason}</p>
          </div>
        </div>
      )}
    </div>
  );
}
