#!/bin/bash

# 舞蹈学习 AI - 构建并推送后端 AMD64 镜像到阿里云

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "   构建并推送后端镜像"
echo "========================================"
echo

# 阿里云容器镜像仓库配置
REGISTRY="crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com"
NAMESPACE="my_dance"
USERNAME="aliyun5795564543"

# 生成时间戳标签
TAG=$(date +%Y%m%d%H%M)-amd64

# 镜像名称
BACKEND_IMAGE="${REGISTRY}/${NAMESPACE}/dance-backend:${TAG}"

echo "[信息] 标签: ${TAG}"
echo "[信息] 后端镜像: ${BACKEND_IMAGE}"
echo

# 登录阿里云容器镜像仓库
echo "[信息] 登录阿里云容器镜像仓库..."
docker login --username="${USERNAME}" "${REGISTRY}"

if [ $? -ne 0 ]; then
    echo "[错误] 登录失败"
    exit 1
fi

echo "[信息] 登录成功"
echo

# 构建并推送后端镜像
echo "[信息] 构建后端 AMD64 镜像..."
cd "${SCRIPT_DIR}/backend"

# 使用 buildx 构建 AMD64 镜像并推送
docker buildx build --platform linux/amd64 --no-cache -t "${BACKEND_IMAGE}" --push .

cd "${SCRIPT_DIR}"

echo
echo "========================================"
echo "[成功] 后端镜像推送完成!"
echo "========================================"
echo "  ${BACKEND_IMAGE}"
echo
echo "远程部署指令:"
echo "  /root/update-backend.sh ${TAG}"
echo
