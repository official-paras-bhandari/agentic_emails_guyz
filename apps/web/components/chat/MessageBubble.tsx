"use client";

import React from "react";
import { cn } from "@/lib/utils";

// Custom Hand Logo representing "Agentic" (Manus style)
const ManusHandLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 text-white">
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8.5" />
    <path d="M10 18H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 10.5V9a2 2 0 0 1 4 0v1.5" />
    <path d="M18 11a3 3 0 0 1 3 3v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-1.5" />
  </svg>
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: string;
  createdAt: Date;
}

export function MessageBubble({ message }: { message: Message }) {
  const isAssistant = message.role === "assistant";

  if (!isAssistant) {
    return (
      <div className="w-full flex justify-end px-4 md:px-0 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="bg-[#1c1c1f] text-zinc-100 text-[13px] leading-relaxed py-3 px-5 rounded-[20px] max-w-[75%] border border-[#2a2a2d] shadow-sm select-text">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-6 flex flex-col gap-3.5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Assistant Header */}
      <div className="flex items-center gap-2 px-4 md:px-0">
        <div className="h-6.5 w-6.5 rounded-lg bg-zinc-800 flex items-center justify-center text-white shrink-0">
          <ManusHandLogo />
        </div>
        <span className="text-[13px] font-semibold text-zinc-200 tracking-tight lowercase">agentic</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-[#1e1e21] text-zinc-500 bg-[#121214] uppercase tracking-wider">
          Lite
        </span>
      </div>
      
      {/* Assistant Message Body */}
      <div className="text-[13px] leading-relaxed text-zinc-300 pl-4 md:pl-[34px] pr-4 md:pr-0 select-text whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}
