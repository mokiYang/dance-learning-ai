#!/bin/bash

# 舞蹈学习 AI - 前端容器更新脚本
# 在远程服务器上拉取最新前端镜像并重启容器

echo "========================================"
echo "   舞蹈学习 AI 前端容器更新脚本"
echo "========================================"
echo

# 阿里云容器镜像仓库配置
REGISTRY="crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com"
NAMESPACE="my_dance"
IMAGE_NAME="dance-frontend"
USERNAME="aliyun5795564543"

# Docker 网络名称
NETWORK_NAME="dance-learning-network"

# SSL 证书目录
SSL_DIR="/root/ssl"

# 从命令行参数获取 TAG
if [ -n "$1" ]; then
    TAG="$1"
else
    echo "[错误] 请指定镜像标签"
    echo "使用方法: $0 <TAG>"
    echo "例如: $0 202512220930-amd64"
    exit 1
fi

# 完整的镜像名称
FULL_IMAGE_NAME="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

# 容器名称
CONTAINER_NAME="dance-frontend"

echo "[信息] 准备更新前端容器..."
echo "[信息] 镜像名称: ${FULL_IMAGE_NAME}"
echo "[信息] 容器名称: ${CONTAINER_NAME}"
echo "[信息] 网络名称: ${NETWORK_NAME}"
echo "[信息] SSL 证书目录: ${SSL_DIR}"
echo

# 创建 Docker 网络（如果不存在）
echo "[信息] 检查 Docker 网络..."
if ! docker network ls | grep -q "${NETWORK_NAME}"; then
    echo "[信息] 创建 Docker 网络: ${NETWORK_NAME}"
    docker network create "${NETWORK_NAME}"
else
    echo "[信息] Docker 网络已存在"
fi
echo

# 检查 SSL 证书目录
if [ ! -d "${SSL_DIR}" ]; then
    echo "[警告] SSL 证书目录不存在: ${SSL_DIR}"
    echo "[警告] 容器可能无法启用 HTTPS"
fi

# 尝试拉取镜像
echo "[信息] 拉取最新前端镜像..."
docker pull "${FULL_IMAGE_NAME}"

# 如果拉取失败，可能需要登录
if [ $? -ne 0 ]; then
    echo "[信息] 拉取失败，尝试登录阿里云容器镜像仓库..."
    docker login --username="${USERNAME}" "${REGISTRY}"

    if [ $? -ne 0 ]; then
        echo "[错误] 登录失败"
        exit 1
    fi

    echo "[信息] 登录成功，重新拉取镜像..."
    docker pull "${FULL_IMAGE_NAME}"

    if [ $? -ne 0 ]; then
        echo "[错误] 镜像拉取失败"
        exit 1
    fi
fi

echo "[信息] 镜像拉取成功"
echo

# 停止并删除旧容器
echo "[信息] 检查并停止旧容器..."
if docker ps -a | grep -q "${CONTAINER_NAME}"; then
    echo "[信息] 停止容器 ${CONTAINER_NAME}..."
    docker stop "${CONTAINER_NAME}"

    echo "[信息] 删除容器 ${CONTAINER_NAME}..."
    docker rm "${CONTAINER_NAME}"

    echo "[信息] 旧容器已删除"
else
    echo "[信息] 未发现旧容器"
fi
echo

# 启动新容器（加入 Docker 网络，挂载 SSL 证书）
echo "[信息] 启动新的前端容器..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --platform linux/amd64 \
  --network "${NETWORK_NAME}" \
  -p 80:80 \
  -p 443:443 \
  -v "${SSL_DIR}:/etc/nginx/ssl:ro" \
  --restart unless-stopped \
  "${FULL_IMAGE_NAME}"

if [ $? -ne 0 ]; then
    echo "[错误] 容器启动失败"
    exit 1
fi

echo "[信息] 容器启动成功"
echo

# 清理未使用的镜像（可选）
echo "是否清理未使用的旧镜像？(y/n)"
read -p "输入选择: " CLEAN_IMAGES

if [ "${CLEAN_IMAGES}" = "y" ] || [ "${CLEAN_IMAGES}" = "Y" ]; then
    echo "[信息] 清理未使用的镜像..."
    docker image prune -f
    echo "[信息] 清理完成"
fi

echo
echo "前端容器更新完成！"
