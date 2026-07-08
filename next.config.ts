import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 允许的开发域名（仅开发环境生效）
  allowedDevOrigins: ['*.dev.coze.site', 'xiaobai.beer', 'localhost'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // 生产环境禁用遥测
  experimental: {
    // 禁用 webpack 的 HMR 重连
    webpackBuildWorker: false,
  },
};

export default nextConfig;
