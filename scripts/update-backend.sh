#!/bin/bash

# 舞蹈学习AI - 后端容器更新脚本
# 在远程服务器上拉取最新后端镜像并重启容器
# 挂载卷保证数据持久化（更新镜像不丢数据）

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== 舞蹈学习AI后端更新脚本 ===${NC}"

if [ -z "$1" ]; then
    echo -e "${YELLOW}请输入新镜像标签(例如: 202512211155-amd64):${NC}"
    read NEW_TAG
else
    NEW_TAG=$1
fi

IMAGE_NAME="crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com/my_dance/dance-backend"
FULL_IMAGE="${IMAGE_NAME}:${NEW_TAG}"

echo -e "${GREEN}准备更新到镜像: ${FULL_IMAGE}${NC}"

echo -e "${GREEN}正在拉取新镜像...${NC}"
docker pull ${FULL_IMAGE}
if [ $? -ne 0 ]; then
    echo -e "${RED}镜像拉取失败!${NC}"
    exit 1
fi

echo -e "${GREEN}停止旧容器...${NC}"
docker stop dance-backend 2>/dev/null
docker rm dance-backend 2>/dev/null

# 确保使用正确的网络名称
docker network create dance-learning-network 2>/dev/null || true

echo -e "${GREEN}启动新容器...${NC}"
# 挂载约定（务必与备份脚本 backup-to-cos.sh 保持同步）：
#   /app/data           -> /root/dance-data/data          (SQLite 数据库)
#   /app/uploads        -> /root/dance-data/uploads       (用户/参考视频文件)
#   /app/temp           -> /root/dance-data/temp          (临时工作目录)
#   /app/videos         -> /root/dance-data/videos        (历史遗留，按需)
#   /app/video_storage  -> /root/dance-data/video_storage (视频存储)
#   /app/thumbnails     -> /root/dance-data/thumbnails    (视频封面)
docker run -d \
  --name dance-backend \
  --restart unless-stopped \
  --network dance-learning-network \
  --network-alias backend \
  -p 8128:8128 \
  -v /root/dance-data/data:/app/data \
  -v /root/dance-data/uploads:/app/uploads \
  -v /root/dance-data/temp:/app/temp \
  -v /root/dance-data/videos:/app/videos \
  -v /root/dance-data/video_storage:/app/video_storage \
  -v /root/dance-data/thumbnails:/app/thumbnails \
  -e TEMP_FOLDER=/app/temp \
  -e UPLOAD_FOLDER=/app/uploads \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  ${FULL_IMAGE}

if [ $? -ne 0 ]; then
    echo -e "${RED}容器启动失败!${NC}"
    exit 1
fi

echo -e "${GREEN}等待服务启动...${NC}"
sleep 5

echo -e "${GREEN}验证服务状态...${NC}"
docker ps | grep dance-backend
curl -f http://localhost:8128/api/health

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ 后端服务更新成功!${NC}"
    echo -e "${GREEN}镜像版本: ${NEW_TAG}${NC}"

    echo -e "${YELLOW}是否清理旧镜像? (y/n)${NC}"
    read -t 10 CLEANUP
    if [ "$CLEANUP" = "y" ]; then
        docker image prune -f
        echo -e "${GREEN}旧镜像已清理${NC}"
    fi
else
    echo -e "${RED}✗ 服务验证失败,请检查日志${NC}"
    docker logs --tail 50 dance-backend
    exit 1
fi

echo -e "${GREEN}=== 更新完成 ===${NC}"
