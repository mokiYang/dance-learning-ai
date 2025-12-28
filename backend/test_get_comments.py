#!/usr/bin/env python3
"""
测试获取评论的查询
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db

# 测试查询
video_id = "aad869ac-398a-49de-a99f-52339a6c9dfe"
video_type = "reference"

print(f"测试查询: video_id={video_id}, video_type={video_type}")
print("=" * 50)

# 方法1：使用当前的get_comments方法
print("\n方法1: 使用db.get_comments()")
comments = db.get_comments(video_id, video_type)
print(f"返回结果数量: {len(comments)}")
if comments:
    print("第一条评论:")
    print(comments[0])
else:
    print("返回空列表")

# 方法2：直接执行SQL查询
print("\n方法2: 直接执行SQL查询")
conn = db.get_connection()
cursor = conn.cursor()

cursor.execute('''
    SELECT c.*, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.video_id = ? AND c.video_type = ?
    ORDER BY c.created_at DESC
''', (video_id, video_type))

rows = cursor.fetchall()
print(f"查询结果数量: {len(rows)}")
if rows:
    print("第一条记录（Row对象）:")
    row = rows[0]
    print(f"  Row类型: {type(row)}")
    print(f"  Row keys: {row.keys() if hasattr(row, 'keys') else 'N/A'}")
    print(f"  尝试转换为dict: {dict(row)}")
    print(f"  直接访问: id={row['id']}, content={row['content'][:20]}...")

conn.close()

# 方法3：明确指定字段名
print("\n方法3: 明确指定字段名查询")
conn = db.get_connection()
cursor = conn.cursor()

cursor.execute('''
    SELECT c.id, c.video_id, c.video_type, c.user_id, c.content, c.created_at, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.video_id = ? AND c.video_type = ?
    ORDER BY c.created_at DESC
''', (video_id, video_type))

rows = cursor.fetchall()
print(f"查询结果数量: {len(rows)}")
if rows:
    print("第一条记录:")
    row = rows[0]
    print(f"  直接访问: id={row['id']}, username={row['username']}, content={row['content'][:20]}...")
    comment_dict = {
        'id': row['id'],
        'video_id': row['video_id'],
        'video_type': row['video_type'],
        'user_id': row['user_id'],
        'content': row['content'],
        'created_at': row['created_at'],
        'username': row['username']
    }
    print(f"  转换为dict: {comment_dict}")

conn.close()

