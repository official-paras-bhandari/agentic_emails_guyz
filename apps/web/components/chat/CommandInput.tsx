"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, Globe, Monitor, Mic, ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandInputProps {
  onSend: (content: string) => void;
  isProcessing?: boolean;
  onStop?: () => void;
}

export function CommandInput({ onSend, isProcessing, onStop }: CommandInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  return (
    <div className="relative w-full max-w-3xl mx-auto px-4 md:px-0">
      {/* Floating Capsule Input */}
      <div className="flex items-end gap-2 bg-[#18181a] border border-[#2a2a2d] focus-within:border-zinc-600 rounded-[24px] px-3.5 py-2 shadow-2xl transition-all duration-200">
        
        {/* Left Action Buttons */}
        <div className="flex items-center gap-0.5 shrink-0 pb-1">
          <button 
            type="button" 
            className="p-1.5 hover:bg-[#252529] text-zinc-500 hover:text-zinc-300 rounded-full transition-colors cursor-pointer"
            title="Add task resource"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button 
            type="button" 
            className="p-1.5 hover:bg-[#252529] text-zinc-500 hover:text-zinc-300 rounded-full transition-colors cursor-pointer"
            title="Attach website URL"
          >
            <Globe className="h-4 w-4" />
          </button>
          <button 
            type="button" 
            className="p-1.5 hover:bg-[#252529] text-zinc-500 hover:text-zinc-300 rounded-full transition-colors cursor-pointer"
            title="Screen / Console input"
          >
            <Monitor className="h-4 w-4" />
          </button>
        </div>

        {/* Dynamic Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Agentic"
          className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-[13px] text-zinc-100 placeholder-zinc-500 py-2 px-1 resize-none min-h-[38px] max-h-[160px] custom-scrollbar self-center"
        />

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 pb-1">
          <button 
            type="button" 
            className="p-1.5 hover:bg-[#252529] text-zinc-500 hover:text-zinc-300 rounded-full transition-colors cursor-pointer"
            title="Voice input"
          >
            <Mic className="h-4 w-4" />
          </button>
          
          {isProcessing ? (
            <button
              type="button"
              onClick={onStop}
              className="h-7 w-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-all cursor-pointer shadow-md"
              title="Stop task execution"
            >
              <Square className="h-3 w-3 fill-black text-black" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all cursor-pointer",
                input.trim() 
                  ? "bg-white text-black hover:bg-zinc-200 shadow-md" 
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              )}
              title="Send task"
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          )}
        </div>
      </div>
      
      {/* Disclaimer Message */}
      <p className="text-[10px] text-center text-zinc-500 mt-2 font-normal">
        Agentic is an AI Agent and can make mistakes. Please double-check before use.
      </p>
    </div>
  );
}
