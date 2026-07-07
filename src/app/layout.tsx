import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小白白 - 代理运营教练",
  description: "你的专属代理运营教练，提供产品咨询、业务流程指导和社媒运营培训",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
