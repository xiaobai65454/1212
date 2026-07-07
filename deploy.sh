#!/bin/bash

# 小白白智能体 - 一键部署脚本
# 使用方法: chmod +x deploy.sh && ./deploy.sh

set -e

echo "=== 开始部署小白白智能体 ==="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] 未检测到 Node.js，请先安装 Node.js 20+"
    echo "  安装命令: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
echo "[OK] Node.js 版本: $(node -v)"

if [ "$NODE_VERSION" -lt 18 ]; then
    echo "[ERROR] Node.js 版本过低，需要 18+ (当前: $NODE_VERSION)"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "[INFO] 正在安装 pnpm..."
    npm install -g pnpm
fi

# 检查 .env.local
if [ ! -f .env.local ]; then
    echo "[WARN] .env.local 文件不存在，从模板创建..."
    if [ -f .env.example ]; then
        cp .env.example .env.local
        echo "[WARN] 请编辑 .env.local 文件，填入必要的配置信息"
    else
        echo "[ERROR] .env.example 模板也不存在，请手动创建 .env.local"
        exit 1
    fi
fi

# 安装依赖
echo "[INFO] 安装依赖..."
pnpm install --frozen-lockfile

# 构建
echo "[INFO] 构建生产版本..."
pnpm build

# 创建数据目录
echo "[INFO] 创建知识库数据目录..."
mkdir -p data/knowledge

# 检查 pm2
if ! command -v pm2 &> /dev/null; then
    echo "[INFO] 正在安装 pm2..."
    npm install -g pm2
fi

# 停止旧服务（如果存在）
pm2 delete xiaobaibai 2>/dev/null || true

# 启动服务
echo "[INFO] 启动服务..."
pm2 start "pnpm start" --name xiaobaibai

# 等待服务启动
sleep 3

# 初始化知识库
echo "[INFO] 初始化知识库..."
curl -s -X POST http://localhost:3000/api/knowledge/init || echo "[WARN] 知识库初始化请求失败，服务可能还在启动中"

# 健康检查
echo "[INFO] 健康检查..."
HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q '"success":true'; then
    echo "[OK] 服务运行正常"
else
    echo "[WARN] 健康检查未通过，请检查日志: pm2 logs xiaobaibai"
fi

# 设置开机自启
pm2 save
pm2 startup 2>/dev/null || true

echo ""
echo "=== 部署完成 ==="
echo "  访问地址: http://localhost:3000"
echo "  诊断接口: http://localhost:3000/api/health"
echo "  查看日志: pm2 logs xiaobaibai"
echo ""
echo "  如果使用 Nginx 反向代理，请注意："
echo "  1. 复制 nginx.conf 到 /etc/nginx/sites-available/"
echo "  2. 修改 server_name 为你的域名"
echo "  3. 执行: ln -s /etc/nginx/sites-available/nginx.conf /etc/nginx/sites-enabled/"
echo "  4. 执行: nginx -t && nginx -s reload"
echo ""
