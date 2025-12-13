#!/bin/bash

# SSL 证书部署脚本
# 用于将腾讯云 SSL 证书部署到服务器

set -e

echo "================================"
echo "SSL 证书部署脚本"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否有证书文件
if [ ! -f "danceaura.cn_bundle.crt" ] || [ ! -f "danceaura.cn.key" ]; then
    echo -e "${RED}❌ 错误：找不到 SSL 证书文件！${NC}"
    echo ""
    echo "请按以下步骤操作："
    echo "1. 登录腾讯云控制台 -> SSL 证书管理"
    echo "2. 找到证书 TXq0YQ8y，点击「下载」"
    echo "3. 选择「Nginx」格式下载"
    echo "4. 解压后将以下文件放到当前目录："
    echo "   - danceaura.cn_bundle.crt"
    echo "   - danceaura.cn.key"
    echo "5. 重新运行此脚本"
    exit 1
fi

echo -e "${GREEN}✅ 找到 SSL 证书文件${NC}"

# 创建 SSL 目录
echo ""
echo "📁 创建 SSL 证书目录..."
mkdir -p ./nginx/ssl

# 复制证书文件
echo "📋 复制证书文件..."
cp danceaura.cn_bundle.crt ./nginx/ssl/
cp danceaura.cn.key ./nginx/ssl/

echo -e "${GREEN}✅ 证书文件复制成功${NC}"

# 备份原配置
if [ -f "./nginx/nginx.conf" ]; then
    echo ""
    echo "💾 备份原 Nginx 配置..."
    cp ./nginx/nginx.conf ./nginx/nginx.conf.backup
    echo -e "${GREEN}✅ 备份完成: nginx/nginx.conf.backup${NC}"
fi

# 使用 SSL 配置
echo ""
echo "🔄 更新 Nginx 配置为 HTTPS..."
cp ./nginx/nginx-ssl.conf ./nginx/nginx.conf

echo -e "${GREEN}✅ Nginx 配置更新完成${NC}"

# 更新 docker-compose 配置
echo ""
echo "🐳 更新 Docker Compose 配置..."

# 检查是否需要更新 docker-compose.prod.yml
if ! grep -q "443:443" docker-compose.prod.yml; then
    echo -e "${YELLOW}⚠️  需要手动更新 docker-compose.prod.yml${NC}"
    echo ""
    echo "请在 nginx 服务的 ports 部分添加："
    echo "    - \"443:443\"  # HTTPS"
    echo ""
    echo "并添加 volumes 挂载证书："
    echo "    - ./nginx/ssl:/etc/nginx/ssl:ro"
    echo ""
    read -p "是否自动更新? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 这里可以添加自动更新逻辑
        echo -e "${YELLOW}请手动编辑 docker-compose.prod.yml${NC}"
    fi
else
    echo -e "${GREEN}✅ Docker Compose 配置已正确${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}🎉 SSL 证书部署准备完成！${NC}"
echo "================================"
echo ""
echo "接下来的步骤："
echo ""
echo "1️⃣  检查 docker-compose.prod.yml 中的 nginx 配置："
echo "   ports:"
echo "     - \"80:80\"    # HTTP"
echo "     - \"443:443\"  # HTTPS"
echo "   volumes:"
echo "     - ./nginx/ssl:/etc/nginx/ssl:ro"
echo ""
echo "2️⃣  确保域名已解析到服务器 IP："
echo "   danceaura.cn → 服务器IP"
echo "   www.danceaura.cn → 服务器IP"
echo ""
echo "3️⃣  重启服务："
echo "   docker-compose -f docker-compose.prod.yml down"
echo "   docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "4️⃣  测试 HTTPS 访问："
echo "   https://danceaura.cn"
echo "   https://www.danceaura.cn"
echo ""
echo "5️⃣  检查证书状态："
echo "   curl -I https://danceaura.cn"
echo ""
echo "================================"
