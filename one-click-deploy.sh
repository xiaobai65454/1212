#!/bin/bash
# 一键部署脚本 - 在本地执行，自动上传并部署到服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 服务器配置
SERVER_IP="120.27.142.40"
SERVER_USER="root"
SERVER_PASS="Qxy123456"
REMOTE_DIR="/opt"

echo "=========================================="
echo "  小白白智能体 - 一键部署"
echo "=========================================="
echo ""

# 检查 sshpass 是否安装
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}正在安装 sshpass...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install sshpass 2>/dev/null || echo "请手动安装: brew install hudochenkov/sshpass/sshpass"
    else
        apt-get install -y sshpass 2>/dev/null || yum install -y sshpass 2>/dev/null
    fi
fi

# 获取当前脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查部署包是否存在
if [ ! -f "xiaobaibai-deploy.tar.gz" ]; then
    echo -e "${RED}错误: 部署包 xiaobaibai-deploy.tar.gz 不存在${NC}"
    echo "请先运行: tar -czf xiaobaibai-deploy.tar.gz --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='*.log' --exclude='.preview' --exclude='data' ."
    exit 1
fi

echo -e "${GREEN}[1/3] 上传文件到服务器...${NC}"

# 上传文件
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no \
    xiaobaibai-deploy.tar.gz \
    deploy-to-server.sh \
    setup-nginx.sh \
    ${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/

echo -e "${GREEN}[2/3] 连接服务器并执行部署...${NC}"

# SSH 执行部署
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
cd /opt
chmod +x deploy-to-server.sh
bash deploy-to-server.sh
ENDSSH

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址: http://120.27.142.40:3000"
echo ""
echo "如需配置域名，请执行:"
echo "  ssh root@120.27.142.40"
echo "  cd /opt && bash setup-nginx.sh 你的域名.com"
echo ""
