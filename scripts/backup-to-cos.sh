#!/bin/bash

# 舞蹈学习 AI - 数据备份脚本
# 定时执行（crontab: 0 3 * * *），备份整个 /root/dance-data 到本地和 COS

LOCAL_BACKUP_DIR="/root/dance-backups"
COS_BACKUP_DIR="/lhcos-data/dance-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="dance-data-${DATE}.tar.gz"

# 创建备份目录
mkdir -p ${LOCAL_BACKUP_DIR}
mkdir -p ${COS_BACKUP_DIR}

echo "=== 开始备份数据 ==="
echo "时间: $(date)"

# 1. 创建备份
echo "正在创建备份..."
tar -czf ${LOCAL_BACKUP_DIR}/${BACKUP_FILE} -C /root dance-data/

if [ $? -ne 0 ]; then
    echo "✗ 备份创建失败"
    exit 1
fi

echo "✓ 本地备份成功: ${LOCAL_BACKUP_DIR}/${BACKUP_FILE}"
ls -lh ${LOCAL_BACKUP_DIR}/${BACKUP_FILE}

# 2. 复制到 COS 挂载目录
echo "正在上传到 COS..."
cp ${LOCAL_BACKUP_DIR}/${BACKUP_FILE} ${COS_BACKUP_DIR}/

if [ $? -eq 0 ]; then
    echo "✓ COS 上传成功: ${COS_BACKUP_DIR}/${BACKUP_FILE}"
    ls -lh ${COS_BACKUP_DIR}/${BACKUP_FILE}
else
    echo "✗ COS 上传失败,但本地备份已保存"
fi

# 3. 清理本地旧备份(保留7天)
echo "清理本地旧备份(保留7天)..."
find ${LOCAL_BACKUP_DIR} -name "dance-data-*.tar.gz" -mtime +7 -delete

# 4. 清理 COS 旧备份(保留30天)
echo "清理 COS 旧备份(保留30天)..."
find ${COS_BACKUP_DIR} -name "dance-data-*.tar.gz" -mtime +30 -delete

echo "=== 备份完成 ==="
echo "本地备份: ${LOCAL_BACKUP_DIR}/${BACKUP_FILE}"
echo "COS备份: ${COS_BACKUP_DIR}/${BACKUP_FILE}"

# 5. 显示存储空间使用情况
echo ""
echo "=== 存储空间使用 ==="
echo "本地备份目录:"
du -sh ${LOCAL_BACKUP_DIR}
echo "COS备份目录:"
du -sh ${COS_BACKUP_DIR}
