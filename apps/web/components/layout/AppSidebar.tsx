"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { 
  LayoutDashboard,
  MessageSquare,
  MessageSquareReply,
  Users,
  CheckSquare,
  Settings,
  ChevronRight,
  Monitor,
  Bell,
  Plus,
  Search,
  PanelLeftClose,
  Folder,
  Loader2,
  FileText,
  MoreHorizontal,
  Share2,
  Pencil,
  Star,
  ExternalLink,
  Archive,
  Trash2,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";

// Custom Hand Logo representing "Agentic" (Manus style)
const ManusHandLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-white">
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8.5" />
    <path d="M10 18H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 10.5V9a2 2 0 0 1 4 0v1.5" />
    <path d="M18 11a3 3 0 0 1 3 3v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1.5" />
  </svg>
);

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  const activeSessionId = searchParams.get("session");
  const router = useRouter();

  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Dropdown states
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [menuSessionTitle, setMenuSessionTitle] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Selection states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

  // Toast states
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error" | "info">("success");
  const [loggingOut, setLoggingOut] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage(message);
    setToastType(type);
    // Use a unique ID or timeout to handle autohide
    const timer = setTimeout(() => {
      setToastMessage((curr) => curr === message ? null : curr);
    }, 3000);
    return () => clearTimeout(timer);
  };

  // Fetch chat sessions
  const fetchSessions = async () => {
    try {
      const url = workspaceId
        ? `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}`
        : "/api/chat/sessions";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSessions(data);
        }
      }
    } catch (err) {
      console.error("Error fetching sessions in sidebar:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const url = workspaceId
        ? `/api/campaigns?workspaceId=${encodeURIComponent(workspaceId)}`
        : "/api/campaigns";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCampaigns(data);
        }
      }
    } catch (err) {
      console.error("Error fetching campaigns in sidebar:", err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchCampaigns();

    window.addEventListener("chat-sessions-updated", fetchSessions);
    window.addEventListener("campaigns-updated", fetchCampaigns);
    return () => {
      window.removeEventListener("chat-sessions-updated", fetchSessions);
      window.removeEventListener("campaigns-updated", fetchCampaigns);
    };
  }, [workspaceId]);

  // Handle outside click to close dropdown menu
  useEffect(() => {
    const handleClose = () => {
      setActiveMenuSessionId(null);
    };
    window.addEventListener("click", handleClose);
    return () => {
      window.removeEventListener("click", handleClose);
    };
  }, []);

  const handleOpenMenu = (e: React.MouseEvent, sessionId: string, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Position menu below and to the left of the button
    setMenuPosition({
      x: rect.right - 180,
      y: rect.bottom + 8
    });
    setMenuSessionTitle(title);
    setActiveMenuSessionId(sessionId);
  };

  const handleRename = async (sessionId: string, currentTitle: string) => {
    const newTitle = prompt("Rename Task Title:", currentTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
      try {
        const res = await fetch("/api/chat/sessions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, title: newTitle.trim(), workspaceId })
        });
        if (res.ok) {
          fetchSessions();
          window.dispatchEvent(new Event("chat-sessions-updated"));
        }
      } catch (err) {
        console.error("Rename failed:", err);
      }
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      try {
        const url = workspaceId
          ? `/api/chat/sessions?sessionId=${sessionId}&workspaceId=${encodeURIComponent(workspaceId)}`
          : `/api/chat/sessions?sessionId=${sessionId}`;
        const res = await fetch(url, {
          method: "DELETE"
        });
        if (res.ok) {
          if (activeSessionId === sessionId) {
            router.push(workspaceId ? `/chat?workspaceId=${encodeURIComponent(workspaceId)}` : "/chat");
          }
          showToast("Task deleted successfully", "success");
          fetchSessions();
          window.dispatchEvent(new Event("chat-sessions-updated"));
        } else {
          showToast("Delete failed", "error");
        }
      } catch (err) {
        console.error("Delete failed:", err);
        showToast("An error occurred while deleting task", "error");
      }
    }
  };

  const withWorkspace = (href: string) => {
    if (!workspaceId) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}workspaceId=${encodeURIComponent(workspaceId)}`;
  };

  const coreNavigation = [
    { name: "Dashboard", href: withWorkspace("/"), icon: LayoutDashboard },
    { name: "Chat Workspace", href: withWorkspace("/chat"), icon: MessageSquare },
    { name: "Campaigns", href: withWorkspace("/campaigns"), icon: Folder },
    { name: "Replies", href: withWorkspace("/replies"), icon: MessageSquareReply },
    { name: "Leads", href: withWorkspace("/leads"), icon: Users },
    { name: "Settings", href: withWorkspace("/settings/workspace"), icon: Settings },
  ];

  // Filter out empty sessions (with no title and no messages) to avoid cluttering the sidebar with "Untitled Task"
  const visibleSessions = sessions.filter(session => {
    return session.title || (session.messages && session.messages.length > 0);
  });

  const handleToggleSelect = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    setSelectedSessionIds((prev) => {
      if (prev.size === visibleSessions.length) {
        return new Set();
      } else {
        return new Set(visibleSessions.map((s) => s.id));
      }
    });
  };

  const handleDeleteSelected = async () => {
    const count = selectedSessionIds.size;
    if (count === 0) return;
    if (confirm(`Are you sure you want to delete the ${count} selected task(s)?`)) {
      try {
        const idsArray = Array.from(selectedSessionIds);
        const url = workspaceId
          ? `/api/chat/sessions?workspaceId=${encodeURIComponent(workspaceId)}`
          : `/api/chat/sessions`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionIds: idsArray })
        });
        if (res.ok) {
          if (activeSessionId && selectedSessionIds.has(activeSessionId)) {
            router.push(workspaceId ? `/chat?workspaceId=${encodeURIComponent(workspaceId)}` : "/chat");
          }
          setIsSelectMode(false);
          setSelectedSessionIds(new Set());
          showToast(`${count} task(s) deleted successfully`, "success");
          fetchSessions();
          window.dispatchEvent(new Event("chat-sessions-updated"));
        } else {
          const errorData = await res.json();
          showToast(errorData.error || "Delete failed", "error");
        }
      } catch (err) {
        console.error("Delete failed:", err);
        showToast("An error occurred while deleting tasks", "error");
      }
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Logout failed");
      }
      window.location.assign("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      showToast("Logout failed", "error");
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex h-full w-[260px] flex-col bg-[#0b0b0c] text-zinc-400 border-r border-[#1a1a1c] select-none">
      {/* Header: Logo & Search / Collapse */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-[#131315]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-white shrink-0">
            <ManusHandLogo />
          </div>
          <span className="font-bold text-base text-zinc-100 tracking-tight lowercase">agentic</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-[#1a1a1c] hover:text-zinc-200 rounded-lg transition-colors cursor-pointer">
            <Search className="h-4 w-4 text-zinc-500" />
          </button>
          <button className="p-1.5 hover:bg-[#1a1a1c] hover:text-zinc-200 rounded-lg transition-colors cursor-pointer">
            <PanelLeftClose className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Main Menu Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
        {/* Navigation Section */}
        <div className="space-y-1">
          {/* New Task Button (Manus style) */}
          <Link
            href={workspaceId ? `/chat?workspaceId=${encodeURIComponent(workspaceId)}` : "/chat"}
            className={cn(
              "group flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150 mb-1.5",
              pathname === "/chat" && !activeSessionId
                ? "bg-[#1c1c1f] text-zinc-100"
                : "hover:bg-[#151517] hover:text-zinc-200 text-zinc-400"
            )}
          >
            <Plus className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
            <span>New task</span>
          </Link>

          {coreNavigation.map((item) => {
            const isActive = item.href === "/" 
              ? pathname === "/" 
              : pathname === item.href || (item.href !== "/chat" && pathname?.startsWith(item.href));

            const href = workspaceId
              ? `${item.href}${item.href.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceId)}`
              : item.href;

            return (
              <Link
                key={item.name}
                href={href}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150",
                  isActive
                    ? "bg-[#1c1c1f] text-zinc-100"
                    : "hover:bg-[#151517] hover:text-zinc-200"
                )}
              >
                <item.icon className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-zinc-100" : "text-zinc-500 group-hover:text-zinc-300"
                )} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Projects Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Active Campaigns</span>
            <Link 
              href={workspaceId ? `/campaigns/new?workspaceId=${encodeURIComponent(workspaceId)}` : "/campaigns/new"} 
              className="p-0.5 hover:bg-[#1a1a1c] hover:text-zinc-200 rounded text-zinc-500 transition-colors"
              title="Create New Campaign"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-1">
            {loadingCampaigns ? (
              <div className="px-3 py-2 text-xs text-zinc-650 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600" />
                <span>Loading...</span>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-zinc-600 italic">
                No active campaigns
              </div>
            ) : (
              campaigns.slice(0, 5).map((c) => {
                const isActive = pathname === `/campaigns/${c.id}`;
                return (
                  <Link
                    key={c.id}
                    href={workspaceId ? `/campaigns/${c.id}?workspaceId=${encodeURIComponent(workspaceId)}` : `/campaigns/${c.id}`}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150",
                      isActive
                        ? "bg-[#1c1c1f] text-zinc-100 font-semibold"
                        : "hover:bg-[#151517] hover:text-zinc-300 text-zinc-500"
                    )}
                  >
                    <Folder className="h-4 w-4 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
                    <span className="truncate">{c.name}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Tasks Section (Chat history) */}
        <div className="space-y-2">
          {isSelectMode ? (
            <div className="flex items-center justify-between px-3">
              <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                {selectedSessionIds.size > 0 ? `${selectedSessionIds.size} Selected` : "Select Tasks"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAllToggle}
                  className="text-[9px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors hover:underline cursor-pointer"
                >
                  {selectedSessionIds.size === visibleSessions.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedSessionIds.size === 0}
                  className="p-0.5 text-red-500 hover:bg-red-950/20 disabled:opacity-40 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                  title="Delete Selected"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedSessionIds(new Set());
                  }}
                  className="text-[9px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tasks</span>
              <div className="flex items-center gap-1.5">
                {visibleSessions.length > 0 && (
                  <button
                    onClick={() => setIsSelectMode(true)}
                    className="p-0.5 hover:bg-[#1a1a1c] hover:text-zinc-200 rounded text-zinc-500 transition-colors cursor-pointer"
                    title="Select Tasks"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                  </button>
                )}
                <button className="p-0.5 hover:bg-[#1a1a1c] hover:text-zinc-200 rounded text-zinc-500 transition-colors">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-0.5">
            {loadingSessions ? (
              <div className="px-3 py-2 text-xs text-zinc-600 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading history...</span>
              </div>
            ) : visibleSessions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-zinc-600 italic">
                No recent tasks
              </div>
            ) : (
              visibleSessions.map((session) => {
                const isActive = activeSessionId === session.id;
                const isSelected = selectedSessionIds.has(session.id);
                
                // Construct a title from messages if title is empty
                let displayTitle = session.title;
                if (!displayTitle && session.messages && session.messages.length > 0) {
                  const firstUserMsg = session.messages.find((m: any) => m.role === 'user');
                  displayTitle = firstUserMsg?.content;
                }
                displayTitle = displayTitle || "Untitled Task";

                // Strip surrounding quotes
                displayTitle = displayTitle.trim();
                if ((displayTitle.startsWith('"') && displayTitle.endsWith('"')) || (displayTitle.startsWith("'") && displayTitle.endsWith("'"))) {
                  displayTitle = displayTitle.substring(1, displayTitle.length - 1).trim();
                }

                const displayTitleFull = displayTitle;
                // Truncate title for UI display
                if (displayTitle.length > 24) {
                  displayTitle = displayTitle.substring(0, 24) + "...";
                }

                if (isSelectMode) {
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleToggleSelect(session.id)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-xs rounded-xl cursor-pointer transition-all duration-150 select-none",
                        isSelected
                          ? "bg-[#1c1c1f] text-zinc-100 font-semibold"
                          : "hover:bg-[#151517] hover:text-zinc-300 text-zinc-400"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelected 
                            ? "bg-blue-600 border-blue-600 text-white" 
                            : "border-zinc-700 hover:border-zinc-500"
                        )}>
                          {isSelected && (
                            <svg className="h-2 w-2 fill-current" viewBox="0 0 20 20">
                              <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{displayTitle}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={session.id}
                    className="group relative flex items-center"
                  >
                    <Link
                      href={workspaceId ? `/chat?session=${session.id}&workspaceId=${encodeURIComponent(workspaceId)}` : `/chat?session=${session.id}`}
                      className={cn(
                        "flex-1 flex items-center justify-between px-3 py-2 pr-8 text-xs rounded-xl transition-all duration-150",
                        isActive
                          ? "bg-[#1c1c1f] text-zinc-100 font-semibold"
                          : "hover:bg-[#151517] hover:text-zinc-300 text-zinc-400"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-zinc-200" : "text-zinc-600 group-hover:text-zinc-400"
                        )} />
                        <span className="truncate">{displayTitle}</span>
                      </div>
                    </Link>

                    {/* Three dots option trigger */}
                    <button
                      onClick={(e) => handleOpenMenu(e, session.id, displayTitleFull)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-[#252528] rounded-md text-zinc-500 hover:text-zinc-200 transition-all cursor-pointer z-10"
                      title="Task Options"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer Profile & Invite Banner */}
      <div className="p-3 border-t border-[#131315] space-y-4">
        {/* Share Banner */}
        <div className="bg-[#151517] hover:bg-[#1a1a1c] transition-colors rounded-xl p-3 flex items-center justify-between cursor-pointer border border-[#1d1d1f]">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-zinc-200 tracking-tight">Share Agentic with a friend</p>
            <p className="text-[9px] text-zinc-500">Get 500 credits each</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0 ml-1" />
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0 uppercase">
              PB
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-zinc-200 truncate">Paras Bhandari</p>
              <p className="text-[9px] text-zinc-500 truncate">Free Trial</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button className="p-1.5 hover:bg-[#151517] hover:text-zinc-200 rounded-lg text-zinc-500 transition-colors">
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button className="p-1.5 hover:bg-[#151517] hover:text-zinc-200 rounded-lg text-zinc-500 transition-colors relative">
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-blue-500 rounded-full" />
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="p-1.5 hover:bg-[#151517] hover:text-zinc-200 rounded-lg text-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Log out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#1d1d1f] bg-[#151517] px-3 py-2 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-[#1a1a1c] hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{loggingOut ? "Logging out..." : "Log out"}</span>
        </button>
      </div>

      {/* Floating fixed Dropdown Menu Overlay */}
      {activeMenuSessionId && menuPosition && (
        <div 
          className="fixed z-50 bg-[#161618] border border-[#2a2a2d] rounded-xl p-1 w-44 shadow-2xl text-[11px] text-zinc-300 font-semibold select-none animate-in fade-in zoom-in-95 duration-100"
          style={{ top: menuPosition.y, left: menuPosition.x }}
          onClick={(e) => e.stopPropagation()} // Prevent trigger outside click close
        >
          <button
            onClick={() => {
              showToast("Link copied to clipboard", "success");
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5 text-zinc-500" />
            <span>Share</span>
          </button>

          <button
            onClick={() => {
              handleRename(activeMenuSessionId, menuSessionTitle);
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5 text-zinc-500" />
            <span>Rename</span>
          </button>

          <button
            onClick={() => {
              showToast("Added to favorites", "success");
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <Star className="h-3.5 w-3.5 text-zinc-500" />
            <span>Add to favorites</span>
          </button>

          <button
            onClick={() => {
              window.open(`/chat?session=${activeMenuSessionId}`, "_blank");
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
            <span>Open in new tab</span>
          </button>

          <div className="h-[1px] bg-[#2a2a2d] my-1" />

          <button
            onClick={() => {
              showToast("Moved task to project workspace", "success");
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Folder className="h-3.5 w-3.5 text-zinc-500" />
              <span>Move to project</span>
            </div>
            <ChevronRight className="h-3 w-3 text-zinc-600" />
          </button>

          <button
            onClick={() => {
              showToast("Task archived", "success");
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] hover:text-zinc-100 rounded-lg text-left transition-colors cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5 text-zinc-500" />
            <span>Archive</span>
          </button>

          <div className="h-[1px] bg-[#2a2a2d] my-1" />

          <button
            onClick={() => {
              handleDelete(activeMenuSessionId);
              setActiveMenuSessionId(null);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-[#222225] text-red-500 hover:bg-red-950/20 rounded-lg text-left transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#161618] border border-[#2a2a2d] text-zinc-100 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 duration-300">
          <div className={cn(
            "h-2 w-2 rounded-full",
            toastType === "success" && "bg-emerald-500",
            toastType === "error" && "bg-rose-500",
            toastType === "info" && "bg-blue-500"
          )} />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
