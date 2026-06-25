"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Mail, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");

  const settingItems = [
    {
      icon: <UserRound className="h-5 w-5 text-emerald-500" />,
      title: "Profile & Onboarding",
      description: "Manage your name, role, company, and home country defaults.",
      href: "/settings/profile",
    },
    {
      icon: <LayoutGrid className="h-5 w-5 text-blue-500" />,
      title: "Workspace Settings",
      description: "Manage server-side configurations and runtime environments.",
      href: "/settings/workspace",
    },
    {
      icon: <Mail className="h-5 w-5 text-purple-500" />,
      title: "Integrations & Google Connect",
      description: "Connect your Google/Gmail account for sending outreach.",
      href: "/settings/google",
    },
    {
      icon: <ShieldAlert className="h-5 w-5 text-amber-500" />,
      title: "Sending Safety",
      description: "Configure daily limits, lease rules, and dispatch spacing.",
      href: "/settings/sending",
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
      title: "Compliance & Suppressions",
      description: "Enforce unsubscribe detection and global suppression lists.",
      href: "/settings/compliance",
    },

  ];

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-10 animate-spring-up">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight premium-gradient-text">Settings Control Panel</h1>
        <p className="text-sm text-zinc-500 mt-2 font-medium">Configure workspace isolation, integrations, dispatch safety, and compliance policies.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingItems.map((item) => {
          const href = workspaceId
            ? `${item.href}?workspaceId=${encodeURIComponent(workspaceId)}`
            : item.href;

          return (
            <Link key={item.title} href={href} className="block group">
              <div className="glass-card rounded-2xl p-6 h-full flex flex-col justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all duration-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700">
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl w-fit group-hover:scale-105 transition-transform duration-200 border border-zinc-200/50 dark:border-zinc-700/50">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-200">
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed font-medium">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="p-10 max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-zinc-900 rounded-lg" />
        <div className="h-4 w-96 bg-zinc-900 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          <div className="h-40 bg-zinc-900 rounded-2xl" />
          <div className="h-40 bg-zinc-900 rounded-2xl" />
          <div className="h-40 bg-zinc-900 rounded-2xl" />
          <div className="h-40 bg-zinc-900 rounded-2xl" />
        </div>
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  );
}
