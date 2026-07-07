import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "小白白 - 知识库管理系统",
  description: "代理运营教练智能体 - 知识库管理后台",
};

export default function KnowledgeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-[#F5F0EB] text-[#1A1A2E] min-h-screen">
        {children}
      </body>
    </html>
  );
}
