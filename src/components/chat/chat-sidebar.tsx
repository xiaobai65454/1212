"use client";

import type { ReactNode } from "react";
import type { KnowledgeBase } from "./chat-interface";

interface ChatSidebarProps {
  knowledgeBases: KnowledgeBase[];
  activeKnowledgeBases: string[];
  onToggleKnowledgeBase: (id: string) => void;
  onClearChat: () => void;
  messageCount: number;
  onClose?: () => void;
}

const ICON_MAP: Record<string, ReactNode> = {
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    </svg>
  ),
  megaphone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 18-5v12L3 16v-5z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  target: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

export function ChatSidebar({
  knowledgeBases,
  activeKnowledgeBases,
  onToggleKnowledgeBase,
  onClearChat,
  messageCount,
  onClose,
}: ChatSidebarProps) {
  return (
    <div className="w-72 h-full bg-white border-r border-gray-100 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF6B4A] to-[#FF8A6A] flex items-center justify-center shadow-sm">
              <span className="text-lg">🐾</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#1A1A2E]">小白白</h2>
              <p className="text-xs text-[#9CA3AF]">代理运营教练</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Knowledge Bases */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h3 className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wider mb-3">
            知识库
          </h3>
          <div className="space-y-2">
            {knowledgeBases.map((kb) => {
              const isActive = activeKnowledgeBases.includes(kb.id);
              return (
                <button
                  key={kb.id}
                  onClick={() => onToggleKnowledgeBase(kb.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                    isActive
                      ? "bg-white border-gray-200 shadow-sm"
                      : "bg-gray-50 border-transparent opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `${kb.color}15`,
                        color: kb.color,
                      }}
                    >
                      {ICON_MAP[kb.icon] || ICON_MAP.book}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1A1A2E] truncate">
                          {kb.name}
                        </span>
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isActive ? "bg-green-400" : "bg-gray-300"
                          }`}
                        />
                      </div>
                      <p className="text-xs text-[#9CA3AF] mt-0.5 line-clamp-2">
                        {kb.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div>
          <h3 className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wider mb-3">
            对话统计
          </h3>
          <div className="bg-[#F5F0EB] rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#6B7280]">对话轮数</span>
              <span className="text-sm font-medium text-[#1A1A2E]">
                {Math.floor(messageCount / 2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#6B7280]">已启用知识库</span>
              <span className="text-sm font-medium text-[#1A1A2E]">
                {activeKnowledgeBases.length}/{knowledgeBases.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-100 space-y-1">
        <button
          onClick={onClearChat}
          disabled={messageCount === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-[#6B7280] hover:bg-gray-50 hover:text-[#FF6B4A] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          清空对话
        </button>
      </div>
    </div>
  );
}
