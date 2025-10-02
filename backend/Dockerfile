# 使用 Python 3.12 官方镜像作为基础镜像
FROM python:3.12-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量，避免交互式安装
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 配置国内镜像源以加速下载
RUN echo "=== 配置国内镜像源 ===" && \
    # 备份原始源列表
    cp /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources.bak && \
    # 使用阿里云镜像源
    echo "Types: deb" > /etc/apt/sources.list.d/debian.sources && \
    echo "URIs: https://mirrors.aliyun.com/debian/" >> /etc/apt/sources.list.d/debian.sources && \
    echo "Suites: trixie trixie-updates" >> /etc/apt/sources.list.d/debian.sources && \
    echo "Components: main" >> /etc/apt/sources.list.d/debian.sources && \
    echo "Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg" >> /etc/apt/sources.list.d/debian.sources && \
    echo "=== 镜像源配置完成 ==="

# 一次性安装所有系统依赖
RUN echo "=== 安装所有系统依赖 ===" && \
    apt-get update && \
    echo "包列表更新完成，开始安装所有依赖..." && \
    apt-get install -y --no-install-recommends \
        curl \
        ffmpeg \
        libgl1-mesa-dri \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgomp1 && \
    echo "所有依赖安装完成，验证FFmpeg版本..." && \
    ffmpeg -version && \
    echo "清理缓存..." && \
    rm -rf /var/lib/apt/lists/* && \
    echo "=== 系统依赖安装完成 ==="

# 配置pip使用国内镜像源
RUN echo "=== 配置pip镜像源 ===" && \
    pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn && \
    echo "=== pip镜像源配置完成 ==="

# 安装Python依赖
COPY requirements.txt .
RUN echo "=== 安装Python依赖 ===" && \
    echo "升级pip..." && \
    pip install --no-cache-dir --upgrade pip && \
    echo "pip升级完成，开始安装Python包..." && \
    pip install --no-cache-dir -r requirements.txt && \
    echo "Python依赖安装完成" && \
    echo "=== Python依赖安装完成 ==="

# 步骤5: 创建目录结构
RUN echo "=== 步骤5: 创建目录结构 ===" && \
    echo "创建必要的目录..." && \
    mkdir -p uploads temp video_storage/videos video_storage/thumbnails video_storage/temp && \
    echo "目录创建完成" && \
    echo "=== 步骤5完成 ==="

# 步骤6: 复制应用代码
RUN echo "=== 步骤6: 复制应用代码 ===" && \
    echo "准备复制应用代码..."
COPY . .
RUN echo "应用代码复制完成" && \
    echo "=== 步骤6完成 ==="

# 设置环境变量
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PYTHONPATH=/app

# 暴露端口
EXPOSE 8128

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8128/api/health || exit 1

# 启动命令
CMD ["python", "app.py"]