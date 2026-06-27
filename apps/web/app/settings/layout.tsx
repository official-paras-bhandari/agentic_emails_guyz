"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Mail, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

function SettingsNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");

  const menuItems = [
    {
      name: "Workspace",
      href: "/settings/workspace",
      icon: LayoutGrid,
      description: "Server-side configurations",
    },
    {
      name: "Google & Gmail",
      href: "/settings/google",
      icon: Mail,
      description: "Connect outreach accounts",
    },
    {
      name: "Sending Safety",
      href: "/settings/sending",
      icon: ShieldAlert,
      description: "Limits and reservations",
    },
  ];

  return (
    <nav className="space-y-1.5">
      {menuItems.map((item) => {
        const isActive = pathname === item.href;
        const href = workspaceId
          ? `${item.href}?workspaceId=${encodeURIComponent(workspaceId)}`
          : item.href;

        return (
          <Link
            key={item.name}
            href={href}
            className={cn(
              "group flex items-start gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 border border-transparent select-none",
              isActive
                ? "bg-[#1c1c1f] text-zinc-100 shadow-md border-zinc-800"
                : "hover:bg-[#151517] hover:text-zinc-200 text-zinc-400"
            )}
          >
            <item.icon
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0 transition-colors duration-200",
                isActive ? "text-blue-500" : "text-zinc-500 group-hover:text-zinc-300"
              )}
            />
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold tracking-wide leading-none mb-1">{item.name}</span>
              <span className="text-[10px] text-zinc-500 leading-none group-hover:text-zinc-400 transition-colors duration-200">{item.description}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)] bg-[#09090b]">
      {/* Settings Sub-Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200/50 dark:border-zinc-800/50 p-6 shrink-0 bg-zinc-950/20 backdrop-blur-sm">
        <div className="mb-6 hidden md:block">
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">Control Panel</h2>
          <p className="text-xs text-zinc-500">Configure outreach settings</p>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse bg-zinc-900/50 rounded-xl" />}>
          <SettingsNavigation />
        </Suspense>
      </aside>

      {/* Main Settings Content Area */}
      <div className="flex-1 min-w-0 bg-[#09090b]">
        {children}
      </div>
    </div>
  );
}
