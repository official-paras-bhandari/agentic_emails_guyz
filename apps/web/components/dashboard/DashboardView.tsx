"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Users, 
  Mail, 
  Zap, 
  TrendingUp, 
  MousePointer2, 
  ArrowUpRight, 
  ArrowDownRight,
  BarChart3,
  Calendar,
  Globe,
  ShieldCheck,
  Activity,
  Plus,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");

  const [metrics, setMetrics] = useState<any>({
    activeCampaigns: 0,
    totalSentEmails: 0,
    totalReplies: 0,
    overallReplyRate: 0,
    bouncedCount: 0,
    totalLeads: 0,
  });

  useEffect(() => {
    const url = workspaceId ? `/api/metrics?workspaceId=${encodeURIComponent(workspaceId)}` : '/api/metrics';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setMetrics(data);
        }
      })
      .catch(err => console.error("Failed to load metrics", err));
  }, [workspaceId]);

  return (
    <div className="p-6 lg:p-10 space-y-10 max-w-[1600px] mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight premium-gradient-text mb-2">Command Center</h1>
          <p className="text-zinc-500 font-medium">Monitoring your autonomous outreach swarm in real-time.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all">
            <Calendar className="h-3.5 w-3.5" />
            Last 30 Days
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-zinc-900/10">
            <Plus className="h-3.5 w-3.5" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="Total Leads" 
          value={metrics.totalLeads.toLocaleString()} 
          trend="+14.2%" 
          trendUp 
          icon={<Users className="h-4 w-4" />} 
          chartColor="bg-blue-500"
        />
        <MetricCard 
          label="Emails Sent" 
          value={metrics.totalSentEmails.toLocaleString()} 
          trend="+8.1%" 
          trendUp 
          icon={<Mail className="h-4 w-4" />} 
          chartColor="bg-purple-500"
        />
        <MetricCard 
          label="Avg. Response" 
          value={`${metrics.overallReplyRate}%`} 
          trend="-2.4%" 
          trendUp={false} 
          icon={<Zap className="h-4 w-4" />} 
          chartColor="bg-amber-500"
        />
        <MetricCard 
          label="Active Campaigns" 
          value={metrics.activeCampaigns.toLocaleString()} 
          trend="+22.5%" 
          trendUp 
          icon={<TrendingUp className="h-4 w-4" />} 
          chartColor="bg-green-500"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Swarm Activity Chart */}
        <div className="xl:col-span-2 glass-card rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
             <Activity className="h-64 w-64" />
          </div>
          
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-lg font-bold">Swarm Activity</h3>
              <p className="text-xs text-zinc-500 uppercase font-black tracking-widest mt-1">Global performance metrics</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-blue-500" />
                 <span className="text-[10px] font-bold text-zinc-500 uppercase">Scraping</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-purple-500" />
                 <span className="text-[10px] font-bold text-zinc-500 uppercase">Sending</span>
               </div>
            </div>
          </div>

          {/* Placeholder for real chart */}
          <div className="h-[300px] w-full flex items-end justify-between gap-2 px-2">
            {[40, 70, 45, 90, 65, 80, 50, 95, 75, 85, 60, 100].map((h, i) => (
              <div key={i} className="flex-1 group/bar relative h-full flex items-end">
                <div 
                  className={cn(
                    "w-full rounded-t-lg transition-all duration-500 shadow-md",
                    i % 2 === 0 
                      ? "bg-gradient-to-t from-blue-600/80 to-cyan-400/80 dark:from-blue-600/40 dark:to-cyan-400/30 group-hover/bar:from-blue-500 group-hover/bar:to-cyan-300 shadow-blue-500/10" 
                      : "bg-gradient-to-t from-purple-600/80 to-indigo-400/80 dark:from-purple-600/40 dark:to-indigo-400/30 group-hover/bar:from-purple-500 group-hover/bar:to-indigo-300 shadow-purple-500/10"
                  )}
                  style={{ height: `${h}%` }}
                />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-zinc-400 uppercase">
                  {['J','F','M','A','M','J','J','A','S','O','N','D'][i]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Section */}
        <div className="space-y-6">
          <div className="glass-card rounded-3xl p-6 space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">System Safety</h3>
            <div className="space-y-4">
               <SafetyMetric label="Deduplication Engine" status="Optimal" score={98} />
               <SafetyMetric label="Gmail Warmup" status="Active" score={84} />
               <SafetyMetric label="Policy Guard" status="Locked" score={100} />
               <SafetyMetric label="IP Reputation" status="Excellent" score={92} />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Active Nodes</h3>
            <div className="grid grid-cols-2 gap-3">
               <NodeCard name="Sydney-01" region="AU-EAST" status="online" />
               <NodeCard name="London-04" region="UK-SOUTH" status="online" />
               <NodeCard name="NY-02" region="US-EAST" status="busy" />
               <NodeCard name="Tokyo-09" region="JP-NORTH" status="offline" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="glass-card rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-lg font-bold">Recent Intelligence</h3>
               <button className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors uppercase tracking-widest underline decoration-zinc-200 underline-offset-4">View All</button>
            </div>
            <div className="space-y-4">
               <IntelligenceItem title="Sydney Real Estate" count={124} time="2m ago" status="Scraping" />
               <IntelligenceItem title="SaaS Founders US" count={842} time="15m ago" status="Completed" />
               <IntelligenceItem title="London Gyms" count={42} time="1h ago" status="Failed" warning />
               <IntelligenceItem title="Melbourne Cafes" count={312} time="3h ago" status="Completed" />
            </div>
         </div>

         <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
            <div className="h-16 w-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-center shadow-xl mb-2 group-hover:scale-110 transition-transform duration-500">
               <Bot className="h-8 w-8 text-zinc-900 dark:text-zinc-100" />
            </div>
            <div className="max-w-xs">
               <h3 className="text-xl font-bold mb-2">Ready for Action?</h3>
               <p className="text-sm text-zinc-500 leading-relaxed">Your agent swarm is standing by. Give them a command to start finding leads.</p>
            </div>
            <button className="px-8 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl hover:scale-105 transition-all active:scale-95">
               Start Chat Session
            </button>
         </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, trendUp, icon, chartColor }: any) {
  return (
    <div className="glass-card rounded-3xl p-6 group transition-all duration-500 hover:-translate-y-1">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 transition-colors group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-black">
          {icon}
        </div>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
          trendUp ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
        )}>
          {trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {trend}
        </div>
      </div>
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-end justify-between">
        <h4 className="text-3xl font-black tracking-tighter tabular-nums">{value}</h4>
        <div className="flex items-end gap-1 h-8">
           {[30, 60, 45, 80, 55].map((h, i) => (
             <div key={i} className={cn("w-1 rounded-full transition-all duration-700", chartColor, "opacity-20 group-hover:opacity-100")} style={{ height: `${h}%` }} />
           ))}
        </div>
      </div>
    </div>
  );
}

function SafetyMetric({ label, status, score }: any) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="text-[10px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter">{status}</span>
      </div>
      <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            score > 90 ? "bg-green-500" : score > 70 ? "bg-amber-500" : "bg-red-500"
          )} 
          style={{ width: `${score}%` }} 
        />
      </div>
    </div>
  );
}

function NodeCard({ name, region, status }: any) {
  return (
    <div className="p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2">
       <div className="flex items-center justify-between">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
            status === 'busy' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-zinc-400'
          )} />
          <span className="text-[8px] font-bold text-zinc-400 uppercase">{region}</span>
       </div>
       <p className="text-[10px] font-bold truncate">{name}</p>
    </div>
  );
}

function IntelligenceItem({ title, count, time, status, warning }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 group">
       <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center transition-colors group-hover:bg-white dark:group-hover:bg-black">
             <BarChart3 className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
             <h5 className="text-sm font-bold">{title}</h5>
             <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-medium">
                <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{count} leads</span>
                <span>•</span>
                <span>{time}</span>
             </div>
          </div>
       </div>
       <div className={cn(
         "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
         warning ? "bg-red-500/10 text-red-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
       )}>
          {status}
       </div>
    </div>
  );
}
