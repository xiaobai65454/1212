"use client";

import { ChatInterface } from "@/components/chat/chat-interface";
import { WechatPopup } from "@/components/chat/wechat-popup";

export default function Home() {
  return (
    <>
      <ChatInterface />
      <WechatPopup />
    </>
  );
}
