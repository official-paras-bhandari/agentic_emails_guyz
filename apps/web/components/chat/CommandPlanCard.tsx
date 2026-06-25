"use client";

import React from "react";
import { 
  ClipboardList, 
  CheckCircle2, 
  ShieldAlert, 
  ArrowRight, 
  Play, 
  X, 
  Settings2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPlanCardProps {
  plan: {
    command_type?: string;
    intent?: string;
    goal: string;
    parameters?: {
      industry?: string;
      location?: string;
      quantity?: number;
    };
    steps: string[];
    safety_checks?: string[];
  };
  onRun: () => void;
  onCancel: () => void;
  onEdit: () => void;
}

export function CommandPlanCard({ plan, onRun, onCancel, onEdit }: CommandPlanCardProps) {
  const commandType = plan.command_type || plan.intent || 'outreach_task';
  const parameters = plan.parameters || (plan as any);
  return (
    <div className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-white dark:text-black" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Proposed Plan</h3>
              <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{commandType.replace(/_/g, ' ').toUpperCase()}</p>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-tighter flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3" />
            Approval Required
          </div>
        </div>
        
        <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
          I've understood your request. Here's how I will proceed to achieve the goal: 
          <span className="block mt-1 font-semibold text-zinc-900 dark:text-zinc-200">"{plan.goal}"</span>
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Parameters Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Industry</p>
            <p className="text-sm font-bold truncate">{parameters.industry || 'Any'}</p>
          </div>
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Location</p>
            <p className="text-sm font-bold truncate">{parameters.location || 'Any'}</p>
          </div>
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Quantity</p>
            <p className="text-sm font-bold truncate">{parameters.quantity || 'N/A'}</p>
          </div>
        </div>

        {/* Execution Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Workflow Steps</h4>
            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-900 mx-4" />
          </div>
          <div className="space-y-2">
            {plan.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <div className="mt-1 h-4 w-4 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-zinc-500">{i + 1}</span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Checks */}
        <div className="p-4 rounded-2xl bg-zinc-900 dark:bg-zinc-50 text-white dark:text-black">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-400 dark:text-amber-600" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-80">Safety Protocols Active</h4>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {(plan.safety_checks || []).map((check, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 dark:text-emerald-600" />
                <span className="text-[11px] font-medium opacity-90">{check}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-900 flex items-center gap-3">
        <button 
          onClick={onRun}
          className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 px-4 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Play className="h-4 w-4 fill-current" />
          Run Plan
        </button>
        <button 
          onClick={onEdit}
          className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 text-zinc-900 dark:text-zinc-100 px-4 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95"
        >
          <Settings2 className="h-4 w-4" />
          Edit
        </button>
        <button 
          onClick={onCancel}
          className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
