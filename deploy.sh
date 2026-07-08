#!/bin/bash
# 小白白一键部署脚本
# 使用方法: 在服务器上执行 bash deploy.sh

set -e

echo "=== 小白白一键部署 ==="

# 配置
PROJECT_DIR="/opt/xiaobaibai"
REPO_URL="https://github.com/xiaobai65454/1212.git"

# 1. 检查并安装依赖
echo "[1/7] 检查依赖..."
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pnpm &> /dev/null; then
    echo "安装 pnpm..."
    npm install -g pnpm
fi

# 安装 antiword（用于解析 .doc 文件）
if ! command -v antiword &> /dev/null; then
    echo "安装 antiword..."
    apt-get update && apt-get install -y antiword
fi

# 2. 克隆或更新代码
echo "[2/7] 更新代码..."
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR"
    git pull origin main
else
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    git clone "$REPO_URL" .
fi

# 3. 安装依赖
echo "[3/7] 安装依赖..."
pnpm install

# 4. 配置环境变量
echo "[4/7] 配置环境变量..."
if [ ! -f ".env.local" ]; then
    cat > .env.local << 'EOF'
# LLM 配置
LLM_PROVIDER=doubao
DOUBAO_API_KEY=ark-352bdace-f325-43fc-a37e-2255df5943fc-ce425
DOUBAO_MODEL=doubao-1-5-lite-32k-250115

# 知识库配置
KNOWLEDGE_BASE_PATH=./data/knowledge

# 管理后台登录
ADMIN_USERNAME=admin
ADMIN_PASSWORD=xiaobaibai2024

# Session 密钥
SESSION_SECRET=xbb_fixed_session_token_2024
EOF
    echo "已创建 .env.local 配置文件"
else
    echo ".env.local 已存在，跳过"
fi

# 5. 构建项目
echo "[5/7] 构建项目..."
pnpm build

# 6. 创建数据目录
echo "[6/7] 创建数据目录..."
mkdir -p data/knowledge
chmod 755 data/knowledge

# 7. 初始化知识库
echo "[7/7] 初始化知识库..."
# 启动服务进行初始化
PORT=5000 node .next/standalone/server.js &
SERVER_PID=$!
sleep 5

# 调用初始化接口
curl -s -X POST http://localhost:5000/api/knowledge/init || true
sleep 2

# 停止临时服务
kill $SERVER_PID 2>/dev/null || true

# 8. 使用 PM2 启动
echo "启动服务..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

pm2 delete xiaobaibai 2>/dev/null || true
PORT=5000 pm2 start .next/standalone/server.js --name xiaobaibai
pm2 save

echo ""
echo "=== 部署完成 ==="
echo "服务地址: http://$(curl -s ifconfig.me):5000"
echo "管理后台: http://$(curl -s ifconfig.me):5000/login"
echo "登录账号: admin / xiaobaibai2024"
echo ""
echo "查看日志: pm2 logs xiaobaibai"
echo "重启服务: pm2 restart xiaobaibai"
