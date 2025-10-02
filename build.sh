#!/bin/bash

# 舞蹈学习AI - 通用构建脚本
# 支持构建前端、后端或全部服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "舞蹈学习AI - 构建脚本"
    echo ""
    echo "用法: $0 [选项] [服务]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -c, --clean    清理构建缓存"
    echo "  -p, --prod     生产环境构建"
    echo ""
    echo "服务:"
    echo "  frontend       仅构建前端"
    echo "  backend        仅构建后端"
    echo "  all           构建所有服务 (默认)"
    echo ""
    echo "示例:"
    echo "  $0                    # 构建所有服务"
    echo "  $0 frontend           # 仅构建前端"
    echo "  $0 -c backend         # 清理缓存后构建后端"
    echo "  $0 -p all            # 生产环境构建所有服务"
}

# 默认参数
CLEAN_CACHE=false
PROD_BUILD=false
SERVICE="all"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -c|--clean)
            CLEAN_CACHE=true
            shift
            ;;
        -p|--prod)
            PROD_BUILD=true
            shift
            ;;
        frontend|backend|all)
            SERVICE="$1"
            shift
            ;;
        *)
            echo -e "${RED}错误: 未知参数 $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}舞蹈学习AI - 构建脚本${NC}"
echo -e "${BLUE}时间: $(date)${NC}"
echo -e "${BLUE}服务: $SERVICE${NC}"
echo -e "${BLUE}生产环境: $PROD_BUILD${NC}"
echo -e "${BLUE}==========================================${NC}"

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}错误: Docker 未运行，请先启动 Docker${NC}"
    exit 1
fi

# 显示 Docker 版本信息
echo -e "${YELLOW}Docker版本信息:${NC}"
docker --version

# 显示可用磁盘空间
echo -e "${YELLOW}可用磁盘空间:${NC}"
df -h

# 清理构建缓存
if [ "$CLEAN_CACHE" = true ]; then
    echo -e "${YELLOW}清理Docker构建缓存...${NC}"
    docker builder prune -f
fi

# 生成时间戳标签
TIMESTAMP=$(date +%Y%m%d%H%M)

# 构建函数
build_service() {
    local service=$1
    local context=$2
    local dockerfile=$3
    local tag_name="dance-learning-ai-${service}:${TIMESTAMP}"
    
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}开始构建 $service 服务...${NC}"
    echo -e "${BLUE}镜像标签: $tag_name${NC}"
    echo -e "${BLUE}==========================================${NC}"
    
    # 构建参数
    local build_args="--progress=plain --tag $tag_name"
    
    if [ "$CLEAN_CACHE" = true ]; then
        build_args="$build_args --no-cache"
    fi
    
    # 构建镜像
    docker build $build_args -f "$dockerfile" "$context" 2>&1 | tee "${service}_build.log"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo -e "${GREEN}==========================================${NC}"
        echo -e "${GREEN}$service 构建完成！${NC}"
        echo -e "${GREEN}时间: $(date)${NC}"
        echo -e "${GREEN}==========================================${NC}"
        
        # 显示镜像信息
        echo -e "${YELLOW}镜像信息:${NC}"
        docker images $tag_name
        
        # 显示镜像大小
        echo -e "${YELLOW}镜像大小:${NC}"
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" $tag_name
        
        return 0
    else
        echo -e "${RED}==========================================${NC}"
        echo -e "${RED}$service 构建失败！${NC}"
        echo -e "${RED}请查看 ${service}_build.log 文件了解详细错误信息${NC}"
        echo -e "${RED}==========================================${NC}"
        return 1
    fi
}

# 根据服务类型执行构建
case $SERVICE in
    frontend)
        build_service "frontend" "./frontend" "Dockerfile"
        ;;
    backend)
        build_service "backend" "./backend" "Dockerfile"
        ;;
    all)
        echo -e "${YELLOW}构建所有服务...${NC}"
        
        # 构建后端
        if ! build_service "backend" "./backend" "Dockerfile"; then
            echo -e "${RED}后端构建失败，停止构建${NC}"
            exit 1
        fi
        
        # 构建前端
        if ! build_service "frontend" "./frontend" "Dockerfile"; then
            echo -e "${RED}前端构建失败，停止构建${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}==========================================${NC}"
        echo -e "${GREEN}所有服务构建完成！${NC}"
        echo -e "${GREEN}==========================================${NC}"
        ;;
    *)
        echo -e "${RED}错误: 未知服务 $SERVICE${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}构建脚本执行完成！${NC}"
echo -e "${YELLOW}使用以下命令查看所有镜像:${NC}"
echo "docker images | grep dance-learning-ai"
