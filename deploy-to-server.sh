#!/bin/bash
# 小白白智能体部署脚本
# 服务器: 120.27.142.40

set -e

echo "=========================================="
echo "  小白白智能体 - 服务器部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用 root 用户运行此脚本${NC}"
    exit 1
fi

# 配置变量
APP_NAME="xiaobaibai"
APP_DIR="/opt/xiaobaibai"
NODE_VERSION="20"
PORT=3000

echo -e "${GREEN}[1/6] 更新系统包...${NC}"
apt-get update -qq

echo -e "${GREEN}[2/6] 安装 Node.js ${NODE_VERSION}...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    npm install -g pnpm
else
    echo "Node.js 已安装: $(node -v)"
fi

# 安装 pm2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo -e "${GREEN}[3/6] 创建应用目录...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

echo -e "${GREEN}[4/6] 解压部署包...${NC}"
if [ -f "xiaobaibai-deploy.tar.gz" ]; then
    tar -xzf xiaobaibai-deploy.tar.gz
    rm xiaobaibai-deploy.tar.gz
else
    echo -e "${YELLOW}部署包不存在，请先上传 xiaobaibai-deploy.tar.gz 到 $APP_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}[5/6] 安装依赖并构建...${NC}"
pnpm install --frozen-lockfile
pnpm build

echo -e "${GREEN}[6/6] 启动服务...${NC}"
# 停止旧服务（如果存在）
pm2 delete $APP_NAME 2>/dev/null || true

# 启动新服务
pm2 start "pnpm start" --name $APP_NAME --update-env
pm2 save
pm2 startup systemd -u root --hp /root

# 设置开机自启
systemctl enable pm2-root

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "应用信息:"
echo "  - 名称: $APP_NAME"
echo "  - 目录: $APP_DIR"
echo "  - 端口: $PORT"
echo "  - 访问: http://120.27.142.40:$PORT"
echo ""
echo "管理命令:"
echo "  - 查看状态: pm2 status"
echo "  - 查看日志: pm2 logs $APP_NAME"
echo "  - 重启服务: pm2 restart $APP_NAME"
echo "  - 停止服务: pm2 stop $APP_NAME"
echo ""
echo -e "${YELLOW}下一步: 配置 Nginx 反向代理（可选）${NC}"
echo "运行: bash setup-nginx.sh"
echo ""
