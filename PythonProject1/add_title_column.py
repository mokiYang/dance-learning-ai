#!/usr/bin/env python3
"""
数据库迁移脚本：为reference_videos表添加title字段
"""

import sqlite3
import os

def add_title_column():
    """为reference_videos表添加title字段"""
    db_path = "dance_learning.db"
    
    if not os.path.exists(db_path):
        print("数据库文件不存在，无需迁移")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 检查title字段是否已存在
        cursor.execute("PRAGMA table_info(reference_videos)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'title' not in columns:
            print("正在添加title字段...")
            cursor.execute("ALTER TABLE reference_videos ADD COLUMN title TEXT")
            conn.commit()
            print("✅ title字段添加成功")
        else:
            print("✅ title字段已存在，无需添加")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        if conn:
            conn.close()

if __name__ == "__main__":
    add_title_column()
