import { Suspense } from "react";
import { ChatShell } from "@/components/chat/ChatShell";

export default function ChatPage() {
  return (
    <div className="h-full bg-[#09090b]">
      <Suspense 
        fallback={
          <div className="h-full w-full flex items-center justify-center bg-[#09090b] text-zinc-500">
            <span className="text-xs font-semibold uppercase tracking-widest animate-pulse">Loading Workspace...</span>
          </div>
        }
      >
        <ChatShell />
      </Suspense>
    </div>
  );
}
