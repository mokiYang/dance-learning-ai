#!/usr/bin/env python3
"""
检查评论数据的脚本
"""
import sys
import os

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import db

def check_comments():
    """检查评论数据"""
    print("=" * 50)
    print("检查评论数据")
    print("=" * 50)
    
    # 获取所有评论
    try:
        conn = db.get_connection()
        cursor = conn.cursor()
        
        # 查询评论表结构
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
        table_exists = cursor.fetchone()
        
        if not table_exists:
            print("❌ 评论表不存在！")
            return
        
        print("✓ 评论表存在")
        
        # 查询评论数量
        cursor.execute("SELECT COUNT(*) FROM comments")
        count = cursor.fetchone()[0]
        print(f"📊 总评论数: {count}")
        
        if count > 0:
            # 查询最近的评论
            cursor.execute("""
                SELECT c.id, c.video_id, c.video_type, c.user_id, c.content, c.created_at, u.username
                FROM comments c
                LEFT JOIN users u ON c.user_id = u.id
                ORDER BY c.created_at DESC
                LIMIT 10
            """)
            
            comments = cursor.fetchall()
            print("\n最近的评论:")
            print("-" * 50)
            for comment in comments:
                comment_id, video_id, video_type, user_id, content, created_at, username = comment
                print(f"ID: {comment_id}")
                print(f"  视频ID: {video_id}")
                print(f"  视频类型: {video_type}")
                print(f"  用户ID: {user_id} ({username or '未知'})")
                print(f"  内容: {content[:50]}...")
                print(f"  时间: {created_at}")
                print("-" * 50)
        else:
            print("⚠️  数据库中没有评论数据")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ 查询失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    check_comments()

