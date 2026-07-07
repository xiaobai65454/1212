"use client";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <button
        onClick={onMenuClick}
        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18" />
          <path d="M3 6h18" />
          <path d="M3 18h18" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <img
          src="/bot-avatar.jpg"
          alt="小白白"
          className="w-7 h-7 rounded-full object-cover"
        />
        <span className="text-sm font-semibold text-[#1A1A2E]">小白白</span>
      </div>

      <div className="w-8" />
    </div>
  );
}
