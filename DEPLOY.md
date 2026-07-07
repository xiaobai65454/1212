# 小白白智能体 - 部署指南

## 服务器要求
- Node.js 20+
- pnpm
- 内存: 512MB+
- 磁盘: 1GB+

## 快速部署

### 方式一：一键脚本部署（推荐）

```bash
# 1. 克隆代码到服务器
git clone <你的仓库地址>
cd 项目目录

# 2. 执行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 方式二：手动部署

```bash
# 1. 安装依赖
pnpm install

# 2. 构建
pnpm build

# 3. 启动
pnpm start

# 或使用 pm2 后台运行
pm2 start "pnpm start" --name xiaobaibai
```

### 方式三：Docker 部署

```bash
# 构建镜像
docker build -t xiaobaibai .

# 运行容器
docker run -d \
  --name xiaobaibai \
  -p 3000:3000 \
  --restart unless-stopped \
  xiaobaibai
```

## Nginx 反向代理配置

如果使用域名访问，配置 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## HTTPS 配置（可选）

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看服务状态 |
| `pm2 logs xiaobaibai` | 查看日志 |
| `pm2 restart xiaobaibai` | 重启服务 |
| `pm2 stop xiaobaibai` | 停止服务 |
| `pm2 delete xiaobaibai` | 删除服务 |

## 更新代码

```bash
git pull
pnpm install
pnpm build
pm2 restart xiaobaibai
```

## 环境变量（可选）

如需自定义配置，创建 `.env.local` 文件：

```env
# 服务端口
PORT=3000

# 其他配置...
```
