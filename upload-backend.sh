#!/bin/bash

# 舞蹈学习 AI 后端镜像上传脚本
# 上传到阿里云容器镜像仓库

echo "========================================"
echo "   舞蹈学习 AI 后端镜像上传脚本"
echo "========================================"
echo

# 阿里云容器镜像仓库配置
REGISTRY="crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com"
NAMESPACE="my_dance"
IMAGE_NAME="dance-backend"
TAG="202510191115-amd64"

# 完整的镜像名称
FULL_IMAGE_NAME="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

echo "[信息] 开始上传后端镜像..."
echo "[信息] 镜像名称: ${FULL_IMAGE_NAME}"
echo

# 检查本地镜像是否存在
echo "[信息] 检查本地镜像..."
if ! docker images | grep -q "dance-learning-ai-backend.*${TAG}"; then
    echo "[错误] 本地镜像 dance-learning-ai-backend:${TAG} 不存在"
    echo "请先构建镜像: docker buildx build --platform linux/amd64 -f backend/Dockerfile -t dance-learning-ai-backend:${TAG} backend/ --load"
    exit 1
fi

echo "[信息] 本地镜像检查完成"

# 登录阿里云容器镜像仓库
echo "[信息] 登录阿里云容器镜像仓库..."
echo "请输入阿里云账号用户名:"
read -p "用户名: " USERNAME

echo "请输入阿里云容器镜像仓库密码:"
read -s -p "密码: " PASSWORD
echo

docker login --username="${USERNAME}" "${REGISTRY}" --password="${PASSWORD}"

if [ $? -ne 0 ]; then
    echo "[错误] 登录失败，请检查用户名和密码"
    exit 1
fi

echo "[信息] 登录成功"

# 标记镜像
echo "[信息] 标记镜像..."
docker tag "dance-learning-ai-backend:${TAG}" "${FULL_IMAGE_NAME}"

if [ $? -ne 0 ]; then
    echo "[错误] 镜像标记失败"
    exit 1
fi

echo "[信息] 镜像标记完成"

# 推送镜像
echo "[信息] 开始推送镜像到阿里云..."
echo "这可能需要几分钟时间，请耐心等待..."

docker push "${FULL_IMAGE_NAME}"

if [ $? -ne 0 ]; then
    echo "[错误] 镜像推送失败"
    exit 1
fi

echo
echo "========================================"
echo "   后端镜像上传成功！"
echo "========================================"
echo "镜像地址: ${FULL_IMAGE_NAME}"
echo
echo "Windows 用户拉取命令:"
echo "docker pull ${FULL_IMAGE_NAME}"
echo
echo "Windows 用户运行命令:"
echo "docker run -d --name dance-backend --platform linux/amd64 -p 8128:8128 -v \${PWD}/backend/data:/app/data -v \${PWD}/backend/uploads:/app/uploads -v \${PWD}/backend/temp:/app/temp -v \${PWD}/backend/video_storage:/app/video_storage --restart unless-stopped ${FULL_IMAGE_NAME}"
echo
echo "清理本地标记的镜像:"
echo "docker rmi ${FULL_IMAGE_NAME}"
echo
