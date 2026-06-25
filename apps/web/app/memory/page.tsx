'use client';

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import { Brain, Database, Target, Trophy, Plus, Trash2, X } from "lucide-react";

type MemoryTab = "workspace" | "lead" | "campaign" | "outcome";

function MemoryContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspaceId');

  const [activeTab, setActiveTab] = useState<MemoryTab>("workspace");
  const [loading, setLoading] = useState(true);
  const [memories, setMemories] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = workspaceId 
        ? `/api/worker/memory?workspaceId=${encodeURIComponent(workspaceId)}` 
        : '/api/worker/memory';
        
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load memory");
      const key = activeTab === "outcome" ? "outcomes" : activeTab;
      setMemories(data[key] || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load memory");
    } finally {
      setLoading(false);
    }
  }, [activeTab, workspaceId]);

  useEffect(() => { void fetchMemories(); }, [fetchMemories]);

  const addWorkspaceMemory = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      const res = await fetch("/api/worker/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "workspace_memory", 
          data: { 
            type: "fact", 
            title, 
            content, 
            source: "manual",
            workspaceId 
          } 
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Unable to save memory");
      setTitle(""); setContent(""); setShowAdd(false); setActiveTab("workspace");
      await fetchMemories();
    } catch (err: any) {
      setError(err.message || "Failed to save memory");
    }
  };

  const removeMemory = async (id: string) => {
    if (!window.confirm("Remove this memory entry?")) return;
    try {
      const res = await fetch("/api/worker/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: activeTab, workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Unable to remove memory");
      await fetchMemories();
    } catch (err: any) {
      setError(err.message || "Failed to remove memory");
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight premium-gradient-text">Business Memory</h1>
          <p className="text-zinc-500 font-medium">What your agents know about your business, leads, and outcomes.</p>
        </div>
        <button onClick={() => setShowAdd((value) => !value)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-zinc-900/10">
          <Plus className="h-3.5 w-3.5" />
          Add Memory
        </button>
      </div>

      {showAdd && (
        <div className="glass-card rounded-2xl p-5 grid gap-3 bg-white dark:bg-zinc-950 border">
          <div className="flex items-center justify-between"><h2 className="font-bold">Add workspace fact</h2><button aria-label="Close" onClick={() => setShowAdd(false)}><X className="h-4 w-4" /></button></div>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="rounded-xl border border-zinc-200 bg-transparent px-4 py-2 text-sm dark:border-zinc-800" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Fact or instruction agents should remember" className="min-h-24 rounded-xl border border-zinc-200 bg-transparent px-4 py-2 text-sm dark:border-zinc-800" />
          <button disabled={!title.trim() || !content.trim()} onClick={() => void addWorkspaceMemory()} className="justify-self-end rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-black">Save</button>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl w-fit">
        <TabButton 
          active={activeTab === "workspace"} 
          onClick={() => setActiveTab("workspace")}
          icon={<Brain className="h-4 w-4" />}
          label="Workspace"
        />
        <TabButton 
          active={activeTab === "lead"} 
          onClick={() => setActiveTab("lead")}
          icon={<Database className="h-4 w-4" />}
          label="Leads"
        />
        <TabButton 
          active={activeTab === "campaign"} 
          onClick={() => setActiveTab("campaign")}
          icon={<Target className="h-4 w-4" />}
          label="Campaigns"
        />
        <TabButton 
          active={activeTab === "outcome"} 
          onClick={() => setActiveTab("outcome")}
          icon={<Trophy className="h-4 w-4" />}
          label="Outcomes"
        />
      </div>

      <div className="glass-card rounded-3xl overflow-hidden min-h-[400px] border">
        {loading ? (
          <div className="p-20 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
          </div>
        ) : memories.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-center space-y-4">
             <div className="h-16 w-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400">
                {activeTab === "workspace" && <Brain className="h-8 w-8" />}
                {activeTab === "lead" && <Database className="h-8 w-8" />}
                {activeTab === "campaign" && <Target className="h-8 w-8" />}
                {activeTab === "outcome" && <Trophy className="h-8 w-8" />}
             </div>
             <div className="max-w-xs">
                <h3 className="text-lg font-bold">No {activeTab} memory found</h3>
                <p className="text-sm text-zinc-500">
                  Your agents will populate this automatically as they work. You can also add facts manually.
                </p>
             </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Title / Fact</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Content</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Confidence</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {memories.map((m) => {
                  const id = String(m.id);
                  const confidence = typeof m.confidence === "number" ? m.confidence : 0.8;
                  return (
                  <tr key={id} className="border-b border-zinc-50 dark:border-zinc-900/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-sm">{String(m.title || m.eventType || m.memoryType || "Memory")}</td>
                    <td className="px-6 py-4 text-sm text-zinc-500 max-w-md truncate">{String(m.content || m.summary || "—")}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        {String(m.type || m.memoryType || m.eventType || activeTab)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-zinc-900 dark:bg-zinc-100" 
                            style={{ width: `${confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500">{Math.round(confidence * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center gap-2">
                          <button aria-label="Remove memory" onClick={() => void removeMemory(id)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                       </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MemoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px] text-zinc-500 font-medium">
        Loading memories...
      </div>
    }>
      <MemoryContent />
    </Suspense>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
        active 
          ? "bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-100" 
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
