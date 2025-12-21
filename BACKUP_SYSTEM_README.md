# Dance Learning AI - 数据备份系统说明

## 概述

本系统实现了自动化的数据备份方案，将关键数据定期备份到本地和腾讯云COS，确保数据安全。

## 备份内容

- **数据库文件**: `/root/dance-data/data/dance_learning.db`
- **用户上传文件**: `/root/dance-data/uploads/`
- **临时文件**: `/root/dance-data/temp/`
- **视频存储**: `/root/dance-data/video_storage/`

## 备份策略

- **本地备份**: 保留最近 7 天的备份文件
- **COS备份**: 保留最近 30 天的备份文件
- **执行时间**: 每天凌晨 3:00 自动执行

## 文件位置

### 备份脚本
- **路径**: `/root/backup-to-cos.sh`
- **权限**: 已设置为可执行 (`chmod +x`)

### 备份存储位置
- **本地备份目录**: `/root/dance-backups/`
- **COS备份目录**: `/lhcos-data/dance-backups/`

### 日志文件
- **路径**: `/root/backup.log`
- **查看最近日志**: `tail -f /root/backup.log`

## COS 挂载信息

- **存储桶名称**: `ihcos-dd007-1310046495`
- **挂载点**: `/lhcos-data`
- **地域**: 北京 (ap-beijing)
- **挂载方式**: COSFS (已配置为开机自动挂载)

## 定时任务配置

查看定时任务：
```bash
crontab -l
```

定时任务配置：
```
0 3 * * * /root/backup-to-cos.sh >> /root/backup.log 2>&1
```

## 手动操作指南

### 手动执行备份
```bash
/root/backup-to-cos.sh
```

### 查看备份文件
```bash
# 本地备份
ls -lh /root/dance-backups/

# COS备份
ls -lh /lhcos-data/dance-backups/
```

### 恢复数据
```bash
# 1. 停止后端容器
docker stop dance-backend

# 2. 解压备份文件到临时目录
mkdir -p /root/restore-temp
tar -xzf /root/dance-backups/dance-data-YYYYMMDD_HHMMSS.tar.gz -C /root/restore-temp/

# 3. 恢复数据（谨慎操作，会覆盖现有数据）
rm -rf /root/dance-data/*
mv /root/restore-temp/dance-data/* /root/dance-data/

# 4. 重启后端容器
docker start dance-backend

# 5. 清理临时目录
rm -rf /root/restore-temp
```

### 修改备份保留时间

编辑备份脚本：
```bash
nano /root/backup-to-cos.sh
```

修改以下行中的天数：
```bash
# 本地保留7天
find ${LOCAL_BACKUP_DIR} -name "dance-data-*.tar.gz" -mtime +7 -delete

# COS保留30天
find ${COS_BACKUP_DIR} -name "dance-data-*.tar.gz" -mtime +30 -delete
```

### 修改备份时间

编辑定时任务：
```bash
crontab -e
```

修改时间配置（格式：分 时 日 月 周）：
```
0 3 * * *  # 每天凌晨3:00
```

## 故障排查

### 检查备份是否正常执行
```bash
# 查看最近的日志
tail -20 /root/backup.log

# 查看定时任务是否运行
grep CRON /var/log/syslog | grep backup
```

### 检查COS挂载状态
```bash
# 查看挂载点
df -h | grep lhcos-data

# 如果未挂载，重新挂载
mount -a
```

### 备份文件过大
如果备份文件过大，可以考虑：
1. 定期清理不需要的临时文件
2. 压缩视频文件
3. 增加备份压缩级别（修改脚本中的 `-czf` 为 `-czf9`）

## 注意事项

1. **磁盘空间**: 定期检查磁盘使用情况，确保有足够空间存储备份
   ```bash
   df -h
   ```

2. **COS存储桶**: 确保COS存储桶正常挂载，否则备份会失败

3. **权限问题**: 备份脚本需要root权限才能访问所有数据目录

4. **数据一致性**: 备份时不会停止服务，可能存在数据不一致的风险。如需完全一致的备份，建议：
   - 在低流量时段执行
   - 或先停止后端服务再备份

## 相关脚本

- **后端更新脚本**: `/root/update-backend.sh` - 自动更新后端Docker镜像
- **备份脚本**: `/root/backup-to-cos.sh` - 数据备份脚本

## 更新记录

- **2025-12-21**: 初始化备份系统，配置本地+COS双重备份策略
