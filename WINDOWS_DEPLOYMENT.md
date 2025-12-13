# Windows WSL2 部署指南

## 问题描述
在 Windows WSL2 环境中运行 Nginx 容器时，可能会遇到以下错误：
```
[emerg] 70#70: io_setup() failed (38: Function not implemented)
```

这是因为 Nginx 在 WSL2 中使用了不兼容的 I/O 模型。

## 解决方案

### 方案1：使用预构建的 WSL2 兼容镜像（推荐）

```bash
# 拉取 WSL2 兼容的前端镜像
docker pull crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com/my_dance/dance-frontend:202510191115

# 运行前端服务
docker run -d -p 3000:80 --name dance-frontend crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com/my_dance/dance-frontend:202510191115
```

### 方案2：本地构建 WSL2 兼容镜像

如果预构建镜像不可用，可以本地构建：

```bash
# 1. 构建前端静态文件
cd frontend
npm install
npm run build

# 2. 使用 Windows 专用 Dockerfile 构建镜像
docker build -f Dockerfile.windows -t dance-frontend:windows .

# 3. 运行容器
docker run -d -p 3000:80 --name dance-frontend dance-frontend:windows
```

### 方案3：运行时修复

如果使用标准镜像，可以通过环境变量修复：

```bash
# 运行容器时禁用 Nginx 的多进程模式
docker run -d -p 3000:80 \
  -e NGINX_WORKER_PROCESSES=1 \
  --name dance-frontend \
  dance-learning-ai-frontend:latest
```

### 方案4：使用 Docker Compose

创建 `docker-compose.windows.yml`：

```yaml
version: '3.8'
services:
  frontend:
    image: crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com/my_dance/dance-frontend:202510191115
    ports:
      - "3000:80"
    environment:
      - NGINX_WORKER_PROCESSES=1
    restart: unless-stopped
```

运行：
```bash
docker-compose -f docker-compose.windows.yml up -d
```

## 验证部署

```bash
# 检查容器状态
docker ps

# 测试健康检查
curl http://localhost:3000/health

# 查看日志
docker logs dance-frontend
```

## 故障排除

### 1. 如果仍然出现 io_setup 错误
```bash
# 停止容器
docker stop dance-frontend
docker rm dance-frontend

# 使用更简单的配置重新运行
docker run -d -p 3000:80 \
  --name dance-frontend \
  -e NGINX_WORKER_PROCESSES=1 \
  -e NGINX_SENDFILE=off \
  crpi-dbp9dd6s0zoavz32.cn-beijing.personal.cr.aliyuncs.com/my_dance/dance-frontend:202510191115
```

### 2. 如果代理到后端失败
确保后端服务正在运行，并且网络配置正确：

```bash
# 检查后端服务
curl http://localhost:8128/api/health

# 如果后端在不同机器上，修改代理地址
# 编辑容器内的 nginx 配置
docker exec -it dance-frontend sh
# 修改 /etc/nginx/nginx.conf 中的 proxy_pass 地址
```

## 性能优化

对于 Windows WSL2 环境，建议：

1. **禁用 sendfile**：在 nginx 配置中设置 `sendfile off`
2. **单进程模式**：设置 `worker_processes 1`
3. **减少缓冲区**：调整 `worker_connections` 为较小值

## 联系支持

如果问题仍然存在，请提供：
1. Windows 版本和 WSL2 版本
2. Docker 版本
3. 完整的错误日志
4. 使用的镜像标签
