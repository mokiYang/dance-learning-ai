#!/bin/bash

echo "================================"
echo "🔐 SSH 连接配置脚本"
echo "================================"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 服务器信息
SERVER_IP="82.156.155.233"
SERVER_USER="root"
KEY_FILE="muyanyang.pem"
KEY_DEST="$HOME/.ssh/muyanyang.pem"

echo ""
echo "📋 服务器信息："
echo "  IP: $SERVER_IP"
echo "  用户: $SERVER_USER"
echo "  私钥: $KEY_FILE"
echo ""

# 创建 .ssh 目录
echo "📁 创建 .ssh 目录..."
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# 复制私钥到 .ssh 目录
echo "🔑 复制私钥文件..."
cp "$KEY_FILE" "$KEY_DEST"

# 设置正确的权限（非常重要！）
echo "🔒 设置私钥权限..."
chmod 600 "$KEY_DEST"

echo -e "${GREEN}✅ 私钥配置完成${NC}"

# 创建 SSH config
echo ""
echo "📝 创建 SSH 配置..."
cat >> ~/.ssh/config << EOF

# 舞蹈学习 AI 服务器
Host dance-server
    HostName $SERVER_IP
    User $SERVER_USER
    IdentityFile $KEY_DEST
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking no
    UserKnownHostsFile=/dev/null

# 简短别名
Host dance
    HostName $SERVER_IP
    User $SERVER_USER
    IdentityFile $KEY_DEST
    ServerAliveInterval 60
    ServerAliveCountMax 3
EOF

chmod 600 ~/.ssh/config

echo -e "${GREEN}✅ SSH 配置完成${NC}"

# 测试连接
echo ""
echo "🧪 测试连接..."
echo "================================"

if ssh -i "$KEY_DEST" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "echo '连接成功！'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH 连接测试成功！${NC}"
    echo ""
    echo "================================"
    echo "🎉 配置完成！"
    echo "================================"
    echo ""
    echo "现在可以使用以下任一命令连接服务器："
    echo ""
    echo "  方式 1: ssh dance-server"
    echo "  方式 2: ssh dance"
    echo "  方式 3: ssh -i $KEY_DEST root@$SERVER_IP"
    echo ""
    echo "================================"
else
    echo -e "${YELLOW}⚠️  暂时无法连接到服务器${NC}"
    echo ""
    echo "可能的原因："
    echo "1. 服务器还未启动完成（请稍等几分钟）"
    echo "2. 防火墙未开放 22 端口"
    echo "3. 网络连接问题"
    echo ""
    echo "配置已完成，稍后可以使用以下命令连接："
    echo "  ssh dance-server"
    echo ""
fi
