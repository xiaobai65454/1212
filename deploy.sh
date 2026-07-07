#!/bin/bash

# 小白白智能体 - 一键部署脚本
# 使用方法: chmod +x deploy.sh && ./deploy.sh

set -e

echo "🚀 开始部署小白白智能体..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js 20+"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 正在安装 pnpm..."
    npm install -g pnpm
fi

# 安装依赖
echo "📦 安装依赖..."
pnpm install --frozen-lockfile

# 构建
echo "🔨 构建生产版本..."
pnpm build

# 检查 pm2
if ! command -v pm2 &> /dev/null; then
    echo "📦 正在安装 pm2..."
    npm install -g pm2
fi

# 停止旧服务（如果存在）
pm2 delete xiaobaibai 2>/dev/null || true

# 启动服务
echo "🚀 启动服务..."
pm2 start "pnpm start" --name xiaobaibai

# 设置开机自启
pm2 save
pm2 startup

echo ""
echo "✅ 部署完成！"
echo "📍 访问地址: http://localhost:3000"
echo ""
echo "常用命令:"
echo "  pm2 status          - 查看服务状态"
echo "  pm2 logs xiaobaibai - 查看日志"
echo "  pm2 restart xiaobaibai - 重启服务"
echo "  pm2 stop xiaobaibai - 停止服务"
