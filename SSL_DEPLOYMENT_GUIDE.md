# SSL 证书部署指南

## 📋 概述

本指南将帮助您将腾讯云 SSL 证书部署到服务器，启用 HTTPS 访问。

---

## 🔐 什么是 SSL 证书？

SSL 证书用于：
- ✅ 启用 HTTPS（加密传输）
- ✅ 浏览器显示"安全"标识（小锁图标）
- ✅ 提升网站信任度和 SEO 排名
- ✅ 保护用户数据安全

**您的域名：**
- `danceaura.cn`
- `www.danceaura.cn`

**证书有效期：** 2026-12-06

---

## 🚀 快速部署（3 步完成）

### 步骤 1：下载 SSL 证书

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/ssl)
2. 找到证书 `TXq0YQ8y`
3. 点击「**下载**」按钮
4. 选择「**Nginx**」格式
5. 下载后解压，得到两个文件：
   ```
   danceaura.cn_bundle.crt  # 证书文件
   danceaura.cn.key         # 私钥文件（重要！保密！）
   ```

### 步骤 2：部署到项目

将证书文件放到项目根目录，然后运行：

```bash
# 给脚本执行权限
chmod +x deploy-ssl.sh

# 运行部署脚本
./deploy-ssl.sh
```

脚本会自动：
- ✅ 创建 `nginx/ssl/` 目录
- ✅ 复制证书文件
- ✅ 备份原 Nginx 配置
- ✅ 更新为 HTTPS 配置

### 步骤 3：部署到服务器

```bash
# 1. 推送代码到服务器（如果用 Git）
git add .
git commit -m "Add SSL certificate support"
git push

# 2. 登录服务器
ssh root@your-server-ip

# 3. 拉取最新代码
cd dance-learning-ai
git pull

# 4. 下载证书文件到服务器
# 方式 A：使用 scp（在本地执行）
scp danceaura.cn_bundle.crt root@your-server-ip:/root/dance-learning-ai/nginx/ssl/
scp danceaura.cn.key root@your-server-ip:/root/dance-learning-ai/nginx/ssl/

# 方式 B：直接在服务器创建文件并粘贴内容
# 在服务器上执行：
mkdir -p nginx/ssl
vim nginx/ssl/danceaura.cn_bundle.crt  # 粘贴证书内容
vim nginx/ssl/danceaura.cn.key         # 粘贴私钥内容

# 5. 重启服务
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# 6. 查看日志，确认启动成功
docker-compose -f docker-compose.prod.yml logs -f nginx
```

---

## ✅ 验证部署

### 1. 检查 HTTPS 访问

在浏览器访问：
- https://danceaura.cn
- https://www.danceaura.cn

应该看到：
- ✅ 地址栏有"🔒"小锁图标
- ✅ 显示"连接是安全的"
- ✅ 网站正常加载

### 2. 检查证书信息

点击地址栏的"🔒"图标，查看证书：
- 颁发给：danceaura.cn
- 有效期至：2026-12-06
- 颁发者：DigiCert

### 3. 使用命令行测试

```bash
# 测试 HTTPS 连接
curl -I https://danceaura.cn

# 应该返回：
# HTTP/2 200
# server: nginx

# 测试 HTTP 自动重定向
curl -I http://danceaura.cn

# 应该返回：
# HTTP/1.1 301 Moved Permanently
# Location: https://danceaura.cn/
```

---

## 🔧 手动部署（不使用脚本）

如果自动脚本不工作，可以手动操作：

### 1. 创建 SSL 目录
```bash
mkdir -p nginx/ssl
```

### 2. 复制证书文件
```bash
cp danceaura.cn_bundle.crt nginx/ssl/
cp danceaura.cn.key nginx/ssl/
```

### 3. 更新 Nginx 配置

编辑 `nginx/nginx.conf`，添加 HTTPS 配置：

```nginx
# HTTP 服务器 - 重定向到 HTTPS
server {
    listen 80;
    server_name danceaura.cn www.danceaura.cn;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name danceaura.cn www.danceaura.cn;
    
    # SSL 证书
    ssl_certificate /etc/nginx/ssl/danceaura.cn_bundle.crt;
    ssl_certificate_key /etc/nginx/ssl/danceaura.cn.key;
    
    # 其他配置...
}
```

### 4. 更新 Docker Compose

编辑 `docker-compose.prod.yml`：

```yaml
nginx:
  ports:
    - "80:80"      # HTTP
    - "443:443"    # HTTPS (新增)
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/ssl:/etc/nginx/ssl:ro  # SSL 证书 (新增)
```

### 5. 重启服务
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

---

## ⚠️ 常见问题

### 问题 1：访问 HTTPS 显示证书错误

**原因：** 证书文件路径不正确

**解决：**
```bash
# 检查证书文件是否存在
docker exec dance-learning-nginx ls -la /etc/nginx/ssl/

# 应该看到：
# danceaura.cn_bundle.crt
# danceaura.cn.key
```

### 问题 2：HTTP 没有自动跳转 HTTPS

**原因：** Nginx 配置未生效

**解决：**
```bash
# 检查 Nginx 配置
docker exec dance-learning-nginx nginx -t

# 重启 Nginx
docker restart dance-learning-nginx
```

### 问题 3：证书即将过期

**解决：**
1. 在腾讯云控制台重新申请证书
2. 下载新证书
3. 重复上述部署步骤

---

## 🔒 安全提示

### ⚠️ 重要：保护私钥文件

`danceaura.cn.key` 是私钥文件，**绝对不能泄露**！

**安全措施：**

1. **不要提交到 Git**
   ```bash
   # 确保 .gitignore 包含：
   nginx/ssl/*.key
   *.key
   ```

2. **设置正确的文件权限**
   ```bash
   chmod 600 nginx/ssl/danceaura.cn.key
   ```

3. **定期轮换证书**
   - 建议每年更新一次证书
   - 即使证书还没过期

---

## 📊 性能优化

### 启用 HTTP/2

已在配置中启用：
```nginx
listen 443 ssl http2;
```

**好处：**
- ✅ 加载速度提升 30-50%
- ✅ 多路复用，减少连接数
- ✅ 头部压缩，节省带宽

### 启用 HTTPS 缓存

已配置 SSL Session 缓存：
```nginx
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

**好处：**
- ✅ 减少 SSL 握手时间
- ✅ 提升 HTTPS 性能

---

## 🎯 下一步

部署完 SSL 后，建议：

1. **配置 HSTS**
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000" always;
   ```

2. **测试网站安全性**
   - 访问：https://www.ssllabs.com/ssltest/
   - 输入您的域名进行测试
   - 目标：A+ 评级

3. **更新前端 API 地址**
   - 确保前端代码使用 HTTPS 请求
   - 检查 `frontend/src/services/api.ts`

4. **配置 CDN**
   - 腾讯云 CDN 可以进一步加速
   - 支持 HTTPS 回源

---

## 📞 需要帮助？

如果遇到问题：
1. 查看 Nginx 日志：`docker logs dance-learning-nginx`
2. 检查防火墙：`ufw status`（确保 443 端口开放）
3. 检查域名解析：`nslookup danceaura.cn`

---

**祝部署顺利！🎉**
