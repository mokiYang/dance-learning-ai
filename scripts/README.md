# 部署脚本说明

本目录保存了部署到远程服务器的所有脚本。脚本通过 git 跟踪，修改后同步到服务器对应位置。

## 脚本清单

| 脚本 | 运行位置 | 服务器路径 | 说明 |
|---|---|---|---|
| `../build-backend.sh` | 本地 | - | 本地构建并推送后端镜像到阿里云 |
| `../build-frontend.sh` | 本地 | - | 本地构建并推送前端镜像到阿里云 |
| `update-backend.sh` | 服务器 | `/root/update-backend.sh` | 拉取新镜像并重启后端容器 |
| `update-frontend.sh` | 服务器 | `/root/update-frontend.sh` | 拉取新镜像并重启前端容器 |
| `backup-to-cos.sh` | 服务器 | `/root/backup-to-cos.sh` | 备份 dance-data 到本地和 COS（由 cron 每天 3:00 触发）|

## 目录和挂载约定

服务器上所有持久化数据都放在 `/root/dance-data/`，通过 bind mount 挂载到容器。**挂载约定请与 `update-backend.sh` 保持一致，否则更新镜像会丢数据**。

| 宿主机路径 | 容器内路径 | 内容 |
|---|---|---|
| `/root/dance-data/data/` | `/app/data` | SQLite 数据库（`dance_learning.db`）|
| `/root/dance-data/uploads/` | `/app/uploads` | 用户/参考视频文件 |
| `/root/dance-data/temp/` | `/app/temp` | 临时工作目录 |
| `/root/dance-data/videos/` | `/app/videos` | 历史遗留视频目录 |
| `/root/dance-data/video_storage/` | `/app/video_storage` | 视频存储目录 |
| `/root/dance-data/thumbnails/` | `/app/thumbnails` | 视频封面缩略图 |

## 标准发布流程

### 1. 本地构建并推送镜像

```bash
cd /Users/yangmuyan/project/dance-learning-ai
./build-backend.sh      # 推后端
./build-frontend.sh     # 推前端
```

构建完成后，脚本会输出新镜像的 TAG，例如 `202604261149-amd64`。

### 2. 服务器上更新容器

```bash
# 在服务器上
/root/update-backend.sh 202604261149-amd64
/root/update-frontend.sh 202604261149-amd64
```

### 3. 修改脚本后同步到服务器

如果你修改了 `update-*.sh` 或 `backup-to-cos.sh`（如增加挂载卷），记得同步到服务器：

```bash
# 本地 → 服务器（需要 SSH 能通；用腾讯云 WebShell 就只能手动 nano 粘贴）
scp scripts/update-backend.sh root@<服务器>:/root/update-backend.sh
scp scripts/update-frontend.sh root@<服务器>:/root/update-frontend.sh
scp scripts/backup-to-cos.sh root@<服务器>:/root/backup-to-cos.sh

# 赋权
ssh root@<服务器> "chmod +x /root/update-backend.sh /root/update-frontend.sh /root/backup-to-cos.sh"
```

## 备份策略

- **本地**：`/root/dance-backups/`，保留 **7 天**
- **COS**：`/lhcos-data/dance-backups/`（存储桶 `ihcos-dd007-1310046495`），保留 **30 天**
- **执行时间**：每天凌晨 3:00（由 cron 触发）
- **备份范围**：整个 `/root/dance-data/`（数据库、视频、缩略图等全部打包）

### 查看 cron 配置

```bash
crontab -l
# 应该包含：0 3 * * * /root/backup-to-cos.sh >> /root/backup.log 2>&1
```

### 查看备份日志

```bash
tail -f /root/backup.log
```

### 手动触发备份

```bash
/root/backup-to-cos.sh
```

## 恢复数据

```bash
# 1. 停止后端
docker stop dance-backend

# 2. 解压备份到临时目录
mkdir -p /root/restore-temp
tar -xzf /root/dance-backups/dance-data-YYYYMMDD_HHMMSS.tar.gz -C /root/restore-temp/

# 3. 恢复数据（覆盖现有）
rm -rf /root/dance-data/*
mv /root/restore-temp/dance-data/* /root/dance-data/

# 4. 启动后端
docker start dance-backend

# 5. 清理
rm -rf /root/restore-temp
```
