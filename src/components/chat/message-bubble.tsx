"use client";

import { useMemo } from "react";
import type { Message } from "./chat-interface";

interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const formattedContent = useMemo(() => {
    return formatMarkdown(message.content);
  }, [message.content]);

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} animate-in slide-in-from-bottom-2 duration-300`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xs font-medium">
            我
          </div>
        ) : (
          <img
            src="/bot-avatar.jpg"
            alt="小白白"
            className="w-8 h-8 rounded-full object-cover shadow-sm"
          />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`max-w-[80%] min-w-0 ${
          isUser
            ? "bg-[#FF6B4A] text-white rounded-2xl rounded-tr-md px-4 py-3"
            : "bg-white text-[#1A1A2E] rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-50"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        ) : (
          <div className="text-sm leading-relaxed prose-sm max-w-none">
            {message.content ? (
              <div
                className="chat-content break-words"
                dangerouslySetInnerHTML={{ __html: formattedContent }}
              />
            ) : (
              isStreaming && <TypingIndicator />
            )}
            {isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 bg-[#FF6B4A] animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B4A]/60 animate-bounce [animation-delay:0ms]" />
      <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B4A]/60 animate-bounce [animation-delay:150ms]" />
      <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B4A]/60 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function formatMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2 text-[#1A1A2E]">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2 text-[#1A1A2E]">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-semibold mt-4 mb-2 text-[#1A1A2E]">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#1A1A2E]">$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered list
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc list-inside">$1</li>');

  // Ordered list
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal list-inside">$1</li>');

  // Table
  html = html.replace(
    /\|(.+)\|/g,
    (match) => {
      const cells = match
        .split("|")
        .filter((c) => c.trim())
        .map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return "";
      const isHeader = false;
      const tag = isHeader ? "th" : "td";
      return `<tr>${cells.map((c) => `<${tag} class="border border-gray-200 px-3 py-1.5 text-sm">${c}</${tag}>`).join("")}</tr>`;
    }
  );
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table class="w-full border-collapse border border-gray-200 rounded-lg my-3 text-sm">$&</table>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-200" />');

  // Line breaks
  html = html.replace(/\n\n/g, '<br /><br />');
  html = html.replace(/\n/g, "<br />");

  return html;
}
