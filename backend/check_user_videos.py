#!/usr/bin/env python3
"""
检查用户视频数据库中的文件路径
用于诊断本地数据库问题
"""

import sqlite3
import os

# 数据库路径
db_path = "dance_learning.db"

if not os.path.exists(db_path):
    print(f"数据库文件不存在: {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("=" * 60)
print("用户视频数据库检查")
print("=" * 60)

# 查询所有用户视频
cursor.execute('''
    SELECT video_id, filename, file_path, user_id, upload_time, title
    FROM user_videos
    ORDER BY upload_time DESC
''')

videos = cursor.fetchall()

print(f"\n总共找到 {len(videos)} 个用户视频\n")

temp_count = 0
permanent_count = 0

for video in videos:
    file_path = video['file_path']
    video_id = video['video_id']
    filename = video['filename']
    user_id = video['user_id']
    title = video['title'] if 'title' in video.keys() else '无标题'
    
    # 判断是否为临时文件
    is_temp = 'temp' in file_path.lower() or '/temp/' in file_path or '\\temp\\' in file_path
    is_permanent = 'uploads/user' in file_path or 'uploads\\user' in file_path
    
    status = "❌ 临时文件" if is_temp else ("✅ 永久文件" if is_permanent else "⚠️  未知路径")
    
    if is_temp:
        temp_count += 1
    elif is_permanent:
        permanent_count += 1
    
    print(f"视频ID: {video_id}")
    print(f"  文件名: {filename}")
    print(f"  标题: {title}")
    print(f"  用户ID: {user_id}")
    print(f"  路径: {file_path}")
    print(f"  状态: {status}")
    print(f"  文件存在: {'✅' if os.path.exists(file_path) else '❌'}")
    print(f"  上传时间: {video['upload_time']}")
    print()

print("=" * 60)
print(f"统计:")
print(f"  临时文件: {temp_count} 个")
print(f"  永久文件: {permanent_count} 个")
print(f"  其他路径: {len(videos) - temp_count - permanent_count} 个")
print("=" * 60)

# 询问是否要清理临时文件记录
if temp_count > 0:
    print(f"\n发现 {temp_count} 个临时文件记录")
    response = input("是否要删除这些临时文件记录？(y/n): ")
    if response.lower() == 'y':
        cursor.execute('''
            DELETE FROM user_videos
            WHERE file_path LIKE '%temp%' OR file_path LIKE '%/temp/%' OR file_path LIKE '%\\temp\\%'
        ''')
        deleted = cursor.rowcount
        conn.commit()
        print(f"已删除 {deleted} 条临时文件记录")
    else:
        print("已取消")

conn.close()

