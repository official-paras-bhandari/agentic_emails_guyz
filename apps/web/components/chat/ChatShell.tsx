"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CommandInput } from "./CommandInput";
import { MessageBubble } from "./MessageBubble";
import { JobProgressCard, Step } from "./JobProgressCard";
import { LeadResultsTable, Lead } from "./LeadResultsTable";
import { CommandPlanCard } from "./CommandPlanCard";
import { 
  Search, 
  Mail, 
  Sparkles,
  LayoutGrid,
  Loader2,
  ChevronDown,
  ChevronUp,
  Share2,
  FileText,
  MoreHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: string;
  metadata?: any;
  createdAt: Date;
}

export function ChatShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = searchParams.get("workspaceId");
  const activeSessionId = searchParams.get("session");

  const [messages, setMessages] = useState<Message[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);

  // Active Job Status for the floating progress bar
  const [activeJobStatus, setActiveJobStatus] = useState<{
    stepName: string;
    stepFraction: string;
    active: boolean;
  } | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle active job elapsed timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeJobStatus?.active) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [activeJobStatus?.active]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Load session or initialize new one
  useEffect(() => {
    if (activeSessionId) {
      setLoadingMessages(true);
      setSessionId(activeSessionId);
      // Clean status bar
      setActiveJobStatus(null);
      setActiveJobId(null);
      
      const url = `/api/chat/messages?sessionId=${activeSessionId}` + (workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '');
      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error("Unable to fetch messages");
          return res.json();
        })
        .then((data) => {
          if (Array.isArray(data)) {
            const formatted = data.map((m: any) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              type: m.type || "text",
              metadata: m.metadata || null,
              createdAt: new Date(m.createdAt),
            }));
            setMessages(formatted);
          }
        })
        .catch((error) => {
          console.error(error);
          setMessages([
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: `Could not load task details: ${error.message}`,
              type: "text",
              createdAt: new Date(),
            },
          ]);
        })
        .finally(() => {
          setLoadingMessages(false);
        });
    } else {
      // Create new session if no session ID provided
      setLoadingMessages(true);
      fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to create chat session");
          return response.json();
        })
        .then((session) => {
          setSessionId(session.id);
          setMessages([]);
          // Dispatch sidebar update
          window.dispatchEvent(new Event("chat-sessions-updated"));
        })
        .catch((error) => {
          setMessages([
            {
              id: `session-error-${Date.now()}`,
              role: "assistant",
              content: `Session Initialization Error: ${error.message}`,
              type: "text",
              createdAt: new Date(),
            },
          ]);
        })
        .finally(() => {
          setLoadingMessages(false);
        });
    }
  }, [activeSessionId, workspaceId]);

  const handleSendCommand = async (content: string) => {
    if (!sessionId) return;
    const userMsgId = Date.now().toString();
    const userMessage: Message = {
      id: userMsgId,
      role: "user",
      content,
      type: "text",
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsPlanning(true);

    try {
      // 1. Save user message to database
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          role: "user",
          content,
          workspaceId,
        }),
      });

      // 2. Dispatch event to update sidebar task history
      window.dispatchEvent(new Event("chat-sessions-updated"));

      // 3. Trigger command planner
      const response = await fetch("/api/chat/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          prompt: content,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create plan");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: data.message.id,
        role: "assistant",
        content: data.message.content,
        type: data.message.type,
        metadata: data.message.metadata,
        createdAt: new Date(data.message.createdAt),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (assistantMessage.type === "job_progress") {
        setActiveJobId(assistantMessage.metadata.jobId);
      }

      // Update sidebar again with assistant response
      window.dispatchEvent(new Event("chat-sessions-updated"));
    } catch (error: any) {
      console.error("Planning error:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Could not create plan: ${error.message}. Check worker/backend connection.`,
        type: "text",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleRunPlan = async (commandId: string, prompt: string) => {
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandId,
          prompt,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start job");
      }

      const data = await response.json();
      setActiveJobId(data.jobId);

      // Add a message about the job starting
      const jobStartMsg: Message = {
        id: `job-${data.jobId}`,
        role: "assistant",
        content: "Execution initiated. I'm deploying the swarm to process your request.",
        type: "job_progress",
        metadata: {
          jobId: data.jobId,
          jobName: `Job for: ${prompt.substring(0, 30)}...`,
          steps: [],
          progress: 0,
        },
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, jobStartMsg]);

      // Save assistant progress message to database
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          role: "assistant",
          content: jobStartMsg.content,
          workspaceId,
        }),
      });

      window.dispatchEvent(new Event("chat-sessions-updated"));
    } catch (error: any) {
      console.error("Job start error:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Could not start job: ${error.message}`,
        type: "text",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleStopJob = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/jobs/${activeJobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web", workspaceId }),
      });
      // Hide floating progress pill immediately
      setActiveJobStatus((prev) => (prev ? { ...prev, active: false } : null));
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#09090b] text-zinc-100 relative">
      {/* Workspace Top Header */}
      <header className="h-14 border-b border-[#131315] bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-[#1a1a1c] transition-colors cursor-pointer text-zinc-200">
            <span className="text-xs font-semibold">Gemini 3.5 Flash (High)</span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer shadow-lg shadow-blue-500/10">
            Start free trial
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1c] text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors cursor-pointer" title="Share session">
            <Share2 className="h-4 w-4" />
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1c] text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors cursor-pointer" title="Dashboard grid">
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1c] text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors cursor-pointer" title="Workspace documents">
            <FileText className="h-4 w-4" />
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1c] text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors cursor-pointer">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Messages Feed Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-0 scroll-smooth relative custom-scrollbar bg-[#09090b]">
        {loadingMessages ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="text-xs font-semibold uppercase tracking-widest">Loading Swarm Task...</span>
          </div>
        ) : messages.length === 0 ? (
          /* Completely empty chat area as requested */
          null
        ) : (
          /* Chat Timeline */
          <div className="max-w-3xl mx-auto py-8 pb-48 space-y-8">
            {messages.map((message) => (
              <div key={message.id} className="w-full">
                <MessageBubble message={message} />
                
                {/* Embedded Cards (Inline details inside the assistant block) */}
                <div className="pl-4 md:pl-[34px] w-full mt-2">
                  {message.type === "command_plan" && (
                    <div className="mt-4 mb-6">
                      <CommandPlanCard
                        plan={message.metadata.plan}
                        onRun={() => handleRunPlan(message.metadata.commandId, message.metadata.prompt || "")}
                        onCancel={() => {}}
                        onEdit={() => {}}
                      />
                    </div>
                  )}
                  {message.type === "job_progress" && (
                    <div className="mt-4 mb-6">
                      <JobPollingContainer
                        jobId={message.metadata.jobId}
                        initialJobName={message.metadata.jobName}
                        workspaceId={workspaceId}
                        onStatusUpdate={setActiveJobStatus}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Orchestrator Planning State */}
            {isPlanning && (
              <div className="w-full pl-4 md:pl-[34px] flex items-center gap-3 text-zinc-500 animate-pulse py-4">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Swarm Orchestrator is planning...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Floating Active Job Status Bar (Bottom Center) */}
      {activeJobStatus && activeJobStatus.active && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-[#18181a] border border-[#2a2a2d] text-zinc-200 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl z-30 select-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
          <span className="text-xs font-semibold max-w-[200px] sm:max-w-[300px] truncate text-zinc-100">
            {activeJobStatus.stepName || "Visiting target websites..."}
          </span>
          <div className="h-3.5 w-[1px] bg-zinc-800" />
          <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
          <div className="h-3.5 w-[1px] bg-zinc-800" />
          <span className="text-[11px] font-bold text-zinc-400">
            {activeJobStatus.stepFraction}
          </span>
          <ChevronUp className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer ml-0.5" />
        </div>
      )}

      {/* Input Box Area (Positioned Floating at Bottom Center) */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent pt-12 pb-6 px-4 z-10">
        <div className="max-w-3xl mx-auto">
          <CommandInput
            onSend={handleSendCommand}
            isProcessing={isPlanning || activeJobStatus?.active}
            onStop={handleStopJob}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Polling component for real-time updates of a job.
 */
function JobPollingContainer({
  jobId,
  initialJobName,
  workspaceId,
  onStatusUpdate,
}: {
  jobId: string;
  initialJobName: string;
  workspaceId: string | null;
  onStatusUpdate?: (status: { stepName: string; stepFraction: string; active: boolean }) => void;
}) {
  const [jobData, setJobData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const poll = async () => {
      try {
        const url = workspaceId
          ? `/api/jobs/${jobId}?workspaceId=${encodeURIComponent(workspaceId)}`
          : `/api/jobs/${jobId}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch job status");
        const data = await response.json();
        setJobData(data);

        const status = data.job.status;
        if (["completed", "failed", "cancelled"].includes(status)) {
          clearInterval(interval);
          if (onStatusUpdate) {
            onStatusUpdate({ stepName: "", stepFraction: "", active: false });
          }
        } else if (onStatusUpdate && data.steps && data.steps.length > 0) {
          const activeStep =
            data.steps.find((s: any) => s.status === "running") ||
            data.steps.find((s: any) => s.status === "pending") ||
            { name: "Initializing Swarm..." };

          const completedCount = data.steps.filter((s: any) => s.status === "completed").length;
          const totalCount = data.steps.length;
          const fraction = `${completedCount + (activeStep && activeStep.status === "running" ? 1 : 0)} / ${totalCount}`;

          onStatusUpdate({
            stepName: activeStep.name,
            stepFraction: fraction,
            active: true,
          });
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setError(err.message);
      }
    };

    poll();
    interval = setInterval(poll, 2000);

    return () => {
      clearInterval(interval);
      if (onStatusUpdate) {
        onStatusUpdate({ stepName: "", stepFraction: "", active: false });
      }
    };
  }, [jobId, workspaceId]);

  if (error) {
    return (
      <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-2xl text-red-400 text-xs font-medium">
        Error connecting to job swarm: {error}. Retrying...
      </div>
    );
  }

  // Parse events
  const scrapeEvents = (jobData?.logs || [])
    .filter((log: any) => log.data && ((log.data as any).step || log.message))
    .map((log: any) => {
      const d = log.data || {};
      let step = d.step || "visiting";
      if (step === "visiting_url") step = "visiting";
      return {
        step,
        status: d.status || (log.level === "error" ? "failed" : "success"),
        message: log.message || d.message,
        website_url: d.website_url,
        current_url: d.current_url,
        page_type: d.page_type,
        extraction_location: d.extraction_location,
        source_url: d.source_url,
        business_name: d.business_name,
        email: d.email,
        suburb: d.suburb,
        duplicate_reason: d.duplicate_reason,
        timestamp: d.timestamp || new Date(log.createdAt).getTime() / 1000,
      };
    });

  return (
    <div className="space-y-6">
      <JobProgressCard
        jobName={jobData?.job?.name || initialJobName}
        steps={jobData?.steps || []}
        progress={jobData?.job?.progress || 0}
        failedReason={jobData?.job?.failedReason}
        isMockMode={jobData?.job?.isMockMode}
        events={scrapeEvents}
      />

      {jobData?.leads && jobData.leads.filter((l: any) => l.status !== 'duplicate').length > 0 && (
        <div className="pt-2 animate-in fade-in duration-300">
          <LeadResultsTable leads={jobData.leads} />
        </div>
      )}

      {/* Still searching notice — scraper is on a retry loop hunting for non-duplicate leads */}
      {jobData?.job?.status !== "completed" &&
        jobData?.stats?.duplicatesSkipped > 0 &&
        jobData?.leads?.filter((l: any) => l.status !== 'duplicate').length === 0 && (
        <div className="p-4 flex items-center gap-3 text-zinc-400 bg-[#121214] border border-[#1d1d20] rounded-2xl border-dashed text-xs">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping shrink-0" />
          <span>
            {jobData.stats.duplicatesSkipped} lead{jobData.stats.duplicatesSkipped !== 1 ? 's' : ''} already in your database — searching for fresh ones...
          </span>
        </div>
      )}

      {jobData?.job?.status === "completed" && jobData.leads.filter((l: any) => l.status !== 'duplicate').length === 0 && (
        <div className="p-5 text-center text-zinc-500 bg-[#121214] border border-[#1d1d20] rounded-2xl border-dashed space-y-1">
          <p className="font-medium">No new leads found in this run.</p>
          {jobData?.stats?.duplicatesSkipped > 0 && (
            <p className="text-xs text-zinc-600">
              {jobData.stats.duplicatesSkipped} lead{jobData.stats.duplicatesSkipped !== 1 ? 's' : ''} already existed in your database and were skipped.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({ icon, title, description, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className="text-left p-5 bg-[#151517] hover:bg-[#1c1c1f] border border-[#232326] hover:border-zinc-700 rounded-[20px] transition-all duration-200 group relative overflow-hidden cursor-pointer"
    >
      <div className="p-2.5 bg-zinc-950 text-white w-fit rounded-xl mb-3 group-hover:scale-105 transition-transform duration-200 border border-[#222]">
        {icon}
      </div>
      <h3 className="font-bold text-sm text-zinc-200 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 leading-normal">{description}</p>
    </button>
  );
}
