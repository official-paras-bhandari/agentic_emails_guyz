"use client";

import React, { Suspense } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { usePathname } from "next/navigation";


export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatRoute = pathname === "/chat" || pathname?.startsWith("/chat");

  return (
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#09090b] overflow-hidden text-zinc-900 dark:text-zinc-100">
      <Suspense fallback={<div className="w-[260px] bg-[#0b0b0c] h-full" />}>
        <AppSidebar />
      </Suspense>
      <div className="flex flex-col flex-1 overflow-hidden bg-[#fafafa] dark:bg-[#09090b]">
        {!isChatRoute && <AppTopbar />}
        <main className="flex-1 overflow-y-auto relative custom-scrollbar bg-[#fafafa] dark:bg-[#09090b]">
          {children}
        </main>
      </div>
    </div>
  );
}

