#!/bin/bash
# Nginx 反向代理配置脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查参数
if [ -z "$1" ]; then
    echo "用法: bash setup-nginx.sh <域名>"
    echo "示例: bash setup-nginx.sh xiaobaibai.example.com"
    exit 1
fi

DOMAIN=$1
APP_PORT=3000

echo -e "${GREEN}配置 Nginx 反向代理...${NC}"

# 安装 Nginx
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
fi

# 创建 Nginx 配置
cat > /etc/nginx/sites-available/xiaobaibai << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # 日志
    access_log /var/log/nginx/xiaobaibai.access.log;
    error_log /var/log/nginx/xiaobaibai.error.log;

    # 反向代理配置
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://localhost:$APP_PORT;
        proxy_cache_valid 200 60m;
        expires 60m;
        add_header Cache-Control "public, max-age=2592000";
    }
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/xiaobaibai /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx

echo ""
echo "=========================================="
echo -e "${GREEN}Nginx 配置完成！${NC}"
echo "=========================================="
echo ""
echo "域名: $DOMAIN"
echo "访问: http://$DOMAIN"
echo ""
echo -e "${YELLOW}提示:${NC}"
echo "1. 确保域名已解析到服务器 IP: 120.27.142.40"
echo "2. 如需 HTTPS，请安装 Certbot:"
echo "   apt-get install certbot python3-certbot-nginx"
echo "   certbot --nginx -d $DOMAIN"
echo ""
