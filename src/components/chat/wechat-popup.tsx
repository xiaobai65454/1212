"use client";

import { useState, useEffect } from "react";
import { X, MessageCircle } from "lucide-react";

interface WechatConfig {
  enabled: boolean;
  title: string;
  description: string;
  qrcodeUrl: string;
  wechatId: string;
  buttonText: string;
  popupDelay: number;
}

export function WechatPopup() {
  const [show, setShow] = useState(false);
  const [config, setConfig] = useState<WechatConfig | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fetch config
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.config?.wechat?.enabled) {
          setConfig(data.config.wechat);
          // Show popup after delay
          const hasShown = sessionStorage.getItem("wechat_popup_shown");
          if (!hasShown) {
            setTimeout(() => {
              setShow(true);
              sessionStorage.setItem("wechat_popup_shown", "true");
              // Auto copy wechat ID when popup shows
              if (data.config.wechat.wechatId) {
                navigator.clipboard.writeText(data.config.wechat.wechatId).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }).catch(() => {});
              }
            }, data.config.wechat.popupDelay || 3000);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleCopy = () => {
    if (config?.wechatId) {
      navigator.clipboard.writeText(config.wechatId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!show || !config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Close Button */}
        <button
          onClick={() => setShow(false)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 px-6 py-8 text-center">
          <div className="w-16 h-16 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white">{config.title}</h3>
          <p className="text-green-100 text-sm mt-1">{config.description}</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 text-center">
          {config.qrcodeUrl ? (
            <div className="mb-4">
              <img
                src={config.qrcodeUrl}
                alt="微信二维码"
                className="w-48 h-48 mx-auto rounded-lg border border-gray-100"
              />
              <p className="text-xs text-gray-400 mt-2">扫描二维码添加微信</p>
            </div>
          ) : null}

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-500 mb-1">微信号</p>
            <p className="text-lg font-semibold text-[#1A1A2E] tracking-wider">
              {config.wechatId}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                已复制
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {config.buttonText}
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 mt-3">
            添加后可获取一对一咨询和最新优惠信息
          </p>
        </div>
      </div>
    </div>
  );
}
