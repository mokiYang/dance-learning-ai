# Windows 部署指南

## 🎯 专为 Windows 优化的舞蹈学习 AI 系统

### 📋 系统要求
- **操作系统**: Windows 10/11 (64位)
- **Docker Desktop**: 最新版本
- **WSL2**: 已启用
- **内存**: 至少 8GB RAM
- **存储**: 至少 10GB 可用空间

### 🚀 快速部署

#### 1. 启动前端服务
```bash
# 拉取并运行前端镜像
docker run -d \
  --name dance-frontend \
  --platform linux/amd64 \
  -p 3000:80 \
  --restart unless-stopped \
  dance-learning-ai-frontend:202510191115-amd64
```

#### 2. 启动后端服务
```bash
# 拉取并运行后端镜像
docker run -d \
  --name dance-backend \
  --platform linux/amd64 \
  -p 8128:8128 \
  -v ${PWD}/backend/data:/app/data \
  -v ${PWD}/backend/uploads:/app/uploads \
  -v ${PWD}/backend/temp:/app/temp \
  -v ${PWD}/backend/video_storage:/app/video_storage \
  --restart unless-stopped \
  dance-learning-ai-backend:202510191115-amd64
```

### 🌐 访问地址
- **前端应用**: http://localhost:3000
- **后端API**: http://localhost:8128
- **健康检查**: http://localhost:3000/health

### 🔧 故障排除

#### 问题1: 端口被占用
```bash
# 检查端口占用
netstat -ano | findstr :3000
netstat -ano | findstr :8128

# 停止占用端口的进程
taskkill /PID <进程ID> /F
```

#### 问题2: WSL2 兼容性问题
```bash
# 确保使用正确的平台
docker run --platform linux/amd64 <镜像名>
```

#### 问题3: 容器无法启动
```bash
# 查看容器日志
docker logs dance-frontend
docker logs dance-backend

# 重启容器
docker restart dance-frontend dance-backend
```

### 📊 系统监控

#### 检查服务状态
```bash
# 查看运行中的容器
docker ps

# 查看容器资源使用
docker stats

# 检查容器健康状态
docker inspect dance-frontend --format='{{.State.Health.Status}}'
docker inspect dance-backend --format='{{.State.Health.Status}}'
```

#### 查看日志
```bash
# 实时查看日志
docker logs -f dance-frontend
docker logs -f dance-backend

# 查看最近的日志
docker logs --tail 100 dance-frontend
docker logs --tail 100 dance-backend
```

### 🛠️ 维护操作

#### 更新镜像
```bash
# 停止服务
docker stop dance-frontend dance-backend

# 删除旧容器
docker rm dance-frontend dance-backend

# 拉取最新镜像
docker pull dance-learning-ai-frontend:202510191115-amd64
docker pull dance-learning-ai-backend:202510191115-amd64

# 重新启动服务（使用上面的启动命令）
```

#### 备份数据
```bash
# 备份数据库
docker cp dance-backend:/app/data ./backup/data-$(date +%Y%m%d)

# 备份上传文件
docker cp dance-backend:/app/uploads ./backup/uploads-$(date +%Y%m%d)
```

### 🔒 安全建议

1. **防火墙配置**: 确保只开放必要端口 (3000, 8128)
2. **数据备份**: 定期备份数据库和上传文件
3. **日志监控**: 定期检查容器日志，关注异常
4. **资源限制**: 为容器设置内存和CPU限制

### 📞 技术支持

如果遇到问题，请提供以下信息：
- Windows 版本和 Docker Desktop 版本
- 容器日志 (`docker logs <容器名>`)
- 系统资源使用情况 (`docker stats`)
- 错误截图或错误信息

---

**注意**: 这些镜像专门为 Windows WSL2 环境优化，确保最佳兼容性和性能。
