import type { Metadata } from "next";
import Script from "next/script";
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
      <body className="antialiased">
        {/* 阻止 HMR WebSocket 重连导致页面刷新 */}
        <Script
          id="disable-hmr-websocket"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  var OriginalWebSocket = window.WebSocket;
                  window.WebSocket = function(url, protocols) {
                    if (url && url.indexOf('webpack-hmr') !== -1) {
                      console.log('[小白白] 已禁用 HMR WebSocket 连接');
                      var fakeWs = {
                        readyState: 3,
                        send: function() {},
                        close: function() {},
                        addEventListener: function() {},
                        removeEventListener: function() {},
                        onopen: null,
                        onclose: null,
                        onmessage: null,
                        onerror: null
                      };
                      return fakeWs;
                    }
                    return new OriginalWebSocket(url, protocols);
                  };
                  window.WebSocket.prototype = OriginalWebSocket.prototype;
                }
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
