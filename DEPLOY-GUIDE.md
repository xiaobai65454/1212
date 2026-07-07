# 小白白智能体 - 服务器部署指南

## 服务器信息
- **IP**: 120.27.142.40
- **用户**: root
- **系统**: Ubuntu/Debian

---

## 快速部署（3步完成）

### 第1步：上传文件到服务器

在你的本地电脑上执行：

```bash
# 上传部署包
scp xiaobaibai-deploy.tar.gz root@120.27.142.40:/opt/

# 上传部署脚本
scp deploy-to-server.sh root@120.27.142.40:/opt/
scp setup-nginx.sh root@120.27.142.40:/opt/
```

### 第2步：SSH 登录服务器并执行部署

```bash
# SSH 登录
ssh root@120.27.142.40
# 密码: Qxy123456

# 执行部署脚本
cd /opt
chmod +x deploy-to-server.sh
bash deploy-to-server.sh
```

### 第3步：配置域名（可选）

```bash
# 配置 Nginx 反向代理
chmod +x setup-nginx.sh
bash setup-nginx.sh 你的域名.com
```

---

## 部署后访问

| 方式 | 地址 |
|------|------|
| IP 直接访问 | http://120.27.142.40:3000 |
| 域名访问（配置后）| http://你的域名.com |

---

## 管理命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs xiaobaibai

# 重启服务
pm2 restart xiaobaibai

# 停止服务
pm2 stop xiaobaibai

# 更新代码后重新部署
cd /opt/xiaobaibai
# 上传新的代码包后
tar -xzf xiaobaibai-deploy.tar.gz
pnpm install
pnpm build
pm2 restart xiaobaibai
```

---

## 常见问题

### 1. 端口被占用
```bash
# 查看端口占用
lsof -i:3000

# 修改端口（编辑 deploy-to-server.sh 中的 PORT 变量）
```

### 2. 服务无法启动
```bash
# 查看详细错误
pm2 logs xiaobaibai --lines 50
```

### 3. 配置 HTTPS
```bash
# 安装 Certbot
apt-get install certbot python3-certbot-nginx

# 申请证书
certbot --nginx -d 你的域名.com
```

---

## 防火墙设置

```bash
# 开放端口
ufw allow 3000/tcp  # 应用端口
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 22/tcp    # SSH
```

---

## 数据备份

知识库数据存储在 `/opt/xiaobaibai/data/` 目录，建议定期备份：

```bash
# 备份数据
tar -czf xiaobaibai-data-backup-$(date +%Y%m%d).tar.gz /opt/xiaobaibai/data/
```
