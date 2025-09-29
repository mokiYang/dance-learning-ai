#!/bin/bash

# 舞蹈姿势对比服务启动脚本

echo "=================================================="
echo "舞蹈姿势对比服务"
echo "=================================================="

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python3"
    exit 1
fi

# 检查pip是否安装
if ! command -v pip3 &> /dev/null; then
    echo "错误: 未找到pip3，请先安装pip3"
    exit 1
fi

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "检查并安装依赖..."
pip install -r requirements.txt

# 创建必要目录
echo "创建必要目录..."
mkdir -p uploads temp

# 启动服务
echo "启动Flask服务..."
echo "服务地址: http://localhost:8128"
echo "API文档:"
echo "  - 健康检查: GET /api/health"
echo "  - 上传参考视频: POST /api/upload-reference"
echo "  - 列出参考视频: GET /api/reference-videos"
echo "  - 比较视频: POST /api/compare-videos"
echo "  - 获取报告: GET /api/get-report/<work_id>"
echo ""
echo "按 Ctrl+C 停止服务"
echo "--------------------------------------------------"

python app.py
