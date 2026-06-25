"use client";

import React from "react";
import { Search, Bell, Menu, LayoutGrid, ChevronRight, Globe, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

export function AppTopbar() {
  const pathname = usePathname();
  const pathParts = pathname.split("/").filter(Boolean);

  return (
    <header className="h-16 border-b border-gray-100 dark:border-white/5 bg-white/80 dark:bg-black/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-zinc-400">
           <LayoutGrid className="h-4 w-4" />
           <ChevronRight className="h-3 w-3" />
           <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
             {pathParts.length === 0 ? "Command Center" : pathParts[pathParts.length - 1].replace("-", " ")}
           </span>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
           <Search className="h-3.5 w-3.5 text-zinc-500" />
           <input 
             type="text" 
             placeholder="Search leads, jobs, or commands..." 
             className="bg-transparent border-none text-[11px] font-medium focus:ring-0 placeholder:text-zinc-500 w-64"
           />
           <span className="text-[9px] font-bold text-zinc-400 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded uppercase tracking-tighter">
             ⌘K
           </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-6 mr-4 border-r border-zinc-100 dark:border-zinc-800 pr-6">
           <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Global Swarm</span>
           </div>
           <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Protected</span>
           </div>
        </div>



        <button className="relative p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors group">
          <Bell className="h-4 w-4 text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 bg-blue-500 rounded-full border-2 border-white dark:border-black" />
        </button>
        
        <button className="md:hidden p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
          <Menu className="h-4 w-4 text-zinc-500" />
        </button>
      </div>
    </header>
  );
}
