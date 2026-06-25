"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, Mail, MapPin, Star, Link as LinkIcon, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Lead {
  id: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  suburb: string | null;
  status: string;
  qualityScore: number;
  sourceUrl?: string;
}

interface LeadResultsTableProps {
  leads: Lead[];
}

export function LeadResultsTable({ leads }: LeadResultsTableProps) {
  return (
    <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl animate-spring-up">
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Extraction Results</h4>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full uppercase">
              {leads.length} leads found
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Business</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Contact</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">Source</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{lead.businessName || 'Unknown Business'}</span>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 capitalize">
                      <MapPin className="h-2.5 w-2.5" />
                      {lead.suburb || 'N/A'}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                      <Mail className="h-3 w-3 text-zinc-400" />
                      {lead.email || 'No email found'}
                    </div>
                    {lead.phone && (
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium">
                        <Phone className="h-2.5 w-2.5 text-zinc-400" />
                        {lead.phone}
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <ExternalLink className="h-2.5 w-2.5" />
                        {lead.website.replace("https://", "").replace("www.", "").substring(0, 20)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    <div className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter",
                      lead.status === 'scraped' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                      lead.status === 'duplicate' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" :
                      "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                    )}>
                      {lead.status}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {lead.sourceUrl ? (
                    <a 
                      href={lead.sourceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors uppercase"
                    >
                      <LinkIcon className="h-3 w-3" />
                      Link
                    </a>
                  ) : (
                    <span className="text-[10px] text-zinc-400 uppercase font-bold">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
           <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Quality Intelligence Active</span>
        </div>
        <Link 
          href="/leads" 
          className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all text-center inline-block"
        >
          Add to Leads
        </Link>
      </div>
    </div>
  );
}
