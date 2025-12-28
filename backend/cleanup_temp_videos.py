#!/usr/bin/env python3
"""
清理用户视频数据库中的临时文件记录
"""

import sqlite3
import os

# 数据库路径
db_path = "dance_learning.db"

if not os.path.exists(db_path):
    print(f"数据库文件不存在: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=" * 60)
print("清理临时文件记录")
print("=" * 60)

# 查询临时文件记录数量
cursor.execute('''
    SELECT COUNT(*) FROM user_videos
    WHERE file_path LIKE '%temp%' 
       OR file_path LIKE '%/temp/%' 
       OR file_path LIKE '%\\temp\\%'
       OR file_path LIKE 'temp/%'
       OR file_path LIKE 'temp\\%'
''')

temp_count = cursor.fetchone()[0]
print(f"\n找到 {temp_count} 条临时文件记录\n")

if temp_count == 0:
    print("没有需要清理的临时文件记录")
    conn.close()
    exit(0)

# 删除临时文件记录
cursor.execute('''
    DELETE FROM user_videos
    WHERE file_path LIKE '%temp%' 
       OR file_path LIKE '%/temp/%' 
       OR file_path LIKE '%\\temp\\%'
       OR file_path LIKE 'temp/%'
       OR file_path LIKE 'temp\\%'
''')

deleted = cursor.rowcount
conn.commit()

print(f"✅ 已删除 {deleted} 条临时文件记录")
print("\n清理完成！")

# 查询剩余的永久文件记录
cursor.execute('''
    SELECT COUNT(*) FROM user_videos
    WHERE file_path LIKE '%uploads/user%' 
       OR file_path LIKE '%uploads\\user%'
''')

permanent_count = cursor.fetchone()[0]
print(f"剩余永久文件记录: {permanent_count} 条")

conn.close()

