"use client";

import { useRef, useEffect, KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  quickQuestions: string[];
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  quickQuestions,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend(value);
    }
  };

  const handleSend = () => {
    if (value.trim()) {
      onSend(value);
    }
  };

  return (
    <div className="border-t border-gray-100 bg-white/80 backdrop-blur-sm px-4 py-3">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Quick Questions */}
        {quickQuestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => onSend(q)}
                className="text-xs px-3 py-1.5 rounded-full bg-[#F5F0EB] text-[#4B5563] hover:bg-[#FF6B4A]/10 hover:text-[#FF6B4A] transition-colors duration-200"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="flex items-end gap-3 bg-[#F5F0EB] rounded-2xl px-4 py-3 border border-gray-100 focus-within:border-[#FF6B4A]/30 focus-within:shadow-sm transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，Shift + Enter 换行..."
            className="flex-1 bg-transparent resize-none outline-none text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] leading-relaxed max-h-40"
            rows={1}
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-[#FF6B4A] flex items-center justify-center hover:bg-[#E55A3A] transition-colors duration-200"
              title="停止生成"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="text-white"
              >
                <rect width="12" height="12" rx="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim()}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-[#FF6B4A] flex items-center justify-center hover:bg-[#E55A3A] disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors duration-200"
              title="发送"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-center text-xs text-[#9CA3AF]">
          小白白可能会出错，重要信息请核实后使用
        </p>
      </div>
    </div>
  );
}
