#!/usr/bin/env python3
"""
数据库模块
用于管理视频存储和骨骼分析结果的数据库操作
"""

import sqlite3
import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple

class DanceDatabase:
    def __init__(self, db_path: str = "dance_learning.db"):
        """初始化数据库连接"""
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # 使查询结果可以通过列名访问
        return conn
    
    def init_database(self):
        """初始化数据库表"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # 创建教学视频表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS reference_videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration REAL,
                fps REAL,
                upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pose_data_path TEXT,
                pose_data_extracted BOOLEAN DEFAULT FALSE,
                pose_extraction_time TIMESTAMP,
                pose_video_path TEXT,
                pose_video_generated BOOLEAN DEFAULT FALSE,
                pose_video_generation_time TIMESTAMP,
                description TEXT,
                tags TEXT,
                author TEXT,
                title TEXT
            )
        ''')
        
        # 创建用户视频表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration REAL,
                fps REAL,
                upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                pose_data_path TEXT,
                pose_data_extracted BOOLEAN DEFAULT FALSE,
                pose_extraction_time TIMESTAMP,
                user_id TEXT,
                session_id TEXT
            )
        ''')
        
        # 创建视频比较记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS comparison_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                comparison_id TEXT UNIQUE NOT NULL,
                reference_video_id TEXT NOT NULL,
                user_video_id TEXT NOT NULL,
                comparison_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                threshold REAL DEFAULT 0.3,
                total_differences INTEGER,
                report_path TEXT,
                status TEXT DEFAULT 'processing',
                FOREIGN KEY (reference_video_id) REFERENCES reference_videos (video_id),
                FOREIGN KEY (user_video_id) REFERENCES user_videos (video_id)
            )
        ''')
        
        # 创建姿势数据表（存储具体的姿势数据）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pose_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                video_type TEXT NOT NULL,  -- 'reference' 或 'user'
                frame_index INTEGER NOT NULL,
                pose_data TEXT NOT NULL,  -- JSON格式的姿势数据
                timestamp REAL,
                UNIQUE(video_id, frame_index)
            )
        ''')
        
        # 创建索引以提高查询性能
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_reference_videos_video_id ON reference_videos(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_videos_video_id ON user_videos(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_comparison_records_comparison_id ON comparison_records(comparison_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pose_data_video_id ON pose_data(video_id)')
        
        conn.commit()
        conn.close()
    
    def add_reference_video(self, video_id: str, filename: str, file_path: str, 
                           duration: float = None, fps: float = None, 
                           description: str = None, tags: str = None, author: str = None, title: str = None) -> bool:
        """添加教学视频记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO reference_videos 
                (video_id, filename, file_path, duration, fps, description, tags, author, title)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (video_id, filename, file_path, duration, fps, description, tags, author, title))
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            print(f"视频ID {video_id} 已存在")
            return False
        except Exception as e:
            print(f"添加教学视频失败: {e}")
            return False
    
    def add_user_video(self, video_id: str, filename: str, file_path: str,
                      duration: float = None, fps: float = None,
                      user_id: str = None, session_id: str = None) -> bool:
        """添加用户视频记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO user_videos 
                (video_id, filename, file_path, duration, fps, user_id, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (video_id, filename, file_path, duration, fps, user_id, session_id))
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            print(f"视频ID {video_id} 已存在")
            return False
        except Exception as e:
            print(f"添加用户视频失败: {e}")
            return False
    
    def update_pose_data_path(self, video_id: str, pose_data_path: str, video_type: str = 'reference') -> bool:
        """更新视频的姿势数据路径"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if video_type == 'reference':
                cursor.execute('''
                    UPDATE reference_videos 
                    SET pose_data_path = ?, pose_data_extracted = TRUE, pose_extraction_time = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                ''', (pose_data_path, video_id))
            else:
                cursor.execute('''
                    UPDATE user_videos 
                    SET pose_data_path = ?, pose_data_extracted = TRUE, pose_extraction_time = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                ''', (pose_data_path, video_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新姿势数据路径失败: {e}")
            return False
    
    def update_pose_extraction_status(self, video_id: str, extracted: bool, video_type: str = 'user') -> bool:
        """更新姿势数据提取状态"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if video_type == 'reference':
                cursor.execute('''
                    UPDATE reference_videos 
                    SET pose_data_extracted = ?, pose_extraction_time = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                ''', (extracted, video_id))
            else:
                cursor.execute('''
                    UPDATE user_videos 
                    SET pose_data_extracted = ?, pose_extraction_time = CURRENT_TIMESTAMP
                    WHERE video_id = ?
                ''', (extracted, video_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新姿势提取状态失败: {e}")
            return False
    
    def update_pose_video_path(self, video_id: str, pose_video_path: str) -> bool:
        """更新参考视频的标记骨骼视频路径"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE reference_videos 
                SET pose_video_path = ?, pose_video_generated = TRUE, pose_video_generation_time = CURRENT_TIMESTAMP
                WHERE video_id = ?
            ''', (pose_video_path, video_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新标记骨骼视频路径失败: {e}")
            return False
    
    def save_pose_data(self, video_id: str, video_type: str, frame_index: int, 
                      pose_data: List, timestamp: float = None) -> bool:
        """保存姿势数据到数据库（支持None值表示无骨骼数据）"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 处理None值（无骨骼数据的情况）
            if pose_data is None:
                pose_data_json = None
            else:
                pose_data_json = json.dumps(pose_data)
            
            cursor.execute('''
                INSERT OR REPLACE INTO pose_data 
                (video_id, video_type, frame_index, pose_data, timestamp)
                VALUES (?, ?, ?, ?, ?)
            ''', (video_id, video_type, frame_index, pose_data_json, timestamp))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"保存姿势数据失败: {e}")
            return False
    
    def get_pose_data(self, video_id: str, frame_index: int = None) -> List[Dict]:
        """获取姿势数据"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if frame_index is not None:
                cursor.execute('''
                    SELECT * FROM pose_data 
                    WHERE video_id = ? AND frame_index = ?
                    ORDER BY frame_index
                ''', (video_id, frame_index))
            else:
                cursor.execute('''
                    SELECT * FROM pose_data 
                    WHERE video_id = ?
                    ORDER BY frame_index
                ''', (video_id,))
            
            results = []
            for row in cursor.fetchall():
                # 处理None值（无骨骼数据的情况）
                if row['pose_data'] is None:
                    pose_data = None
                else:
                    pose_data = json.loads(row['pose_data'])
                results.append({
                    'frame_index': row['frame_index'],
                    'pose_data': pose_data,
                    'timestamp': row['timestamp']
                })
            
            conn.close()
            return results
        except Exception as e:
            print(f"获取姿势数据失败: {e}")
            return []
    
    def get_reference_videos(self) -> List[Dict]:
        """获取所有教学视频"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM reference_videos 
                ORDER BY upload_time DESC
            ''')
            
            videos = []
            for row in cursor.fetchall():
                videos.append(dict(row))
            
            conn.close()
            return videos
        except Exception as e:
            print(f"获取教学视频失败: {e}")
            return []
    
    def get_user_videos(self, user_id: str = None) -> List[Dict]:
        """获取用户视频"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if user_id:
                cursor.execute('''
                    SELECT * FROM user_videos 
                    WHERE user_id = ?
                    ORDER BY upload_time DESC
                ''', (user_id,))
            else:
                cursor.execute('''
                    SELECT * FROM user_videos 
                    ORDER BY upload_time DESC
                ''')
            
            videos = []
            for row in cursor.fetchall():
                videos.append(dict(row))
            
            conn.close()
            return videos
        except Exception as e:
            print(f"获取用户视频失败: {e}")
            return []
    
    def get_video_by_id(self, video_id: str, video_type: str = 'reference') -> Optional[Dict]:
        """根据ID获取视频信息"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if video_type == 'reference':
                cursor.execute('SELECT * FROM reference_videos WHERE video_id = ?', (video_id,))
            else:
                cursor.execute('SELECT * FROM user_videos WHERE video_id = ?', (video_id,))
            
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取视频信息失败: {e}")
            return None
    
    def add_comparison_record(self, comparison_id: str, reference_video_id: str, 
                            user_video_id: str, threshold: float = 0.3) -> bool:
        """添加视频比较记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO comparison_records 
                (comparison_id, reference_video_id, user_video_id, threshold)
                VALUES (?, ?, ?, ?)
            ''', (comparison_id, reference_video_id, user_video_id, threshold))
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            print(f"比较记录ID {comparison_id} 已存在")
            return False
        except Exception as e:
            print(f"添加比较记录失败: {e}")
            return False
    
    def update_comparison_result(self, comparison_id: str, total_differences: int, 
                               report_path: str, status: str = 'completed') -> bool:
        """更新比较结果"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE comparison_records 
                SET total_differences = ?, report_path = ?, status = ?
                WHERE comparison_id = ?
            ''', (total_differences, report_path, status, comparison_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新比较结果失败: {e}")
            return False
    
    def get_comparison_record(self, comparison_id: str) -> Optional[Dict]:
        """获取比较记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM comparison_records 
                WHERE comparison_id = ?
            ''', (comparison_id,))
            
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取比较记录失败: {e}")
            return None
    
    def delete_video(self, video_id: str, video_type: str = 'reference') -> bool:
        """删除视频记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 删除姿势数据
            cursor.execute('DELETE FROM pose_data WHERE video_id = ?', (video_id,))
            
            # 删除比较记录
            if video_type == 'reference':
                cursor.execute('DELETE FROM comparison_records WHERE reference_video_id = ?', (video_id,))
                cursor.execute('DELETE FROM reference_videos WHERE video_id = ?', (video_id,))
            else:
                cursor.execute('DELETE FROM comparison_records WHERE user_video_id = ?', (video_id,))
                cursor.execute('DELETE FROM user_videos WHERE video_id = ?', (video_id,))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"删除视频失败: {e}")
            return False
    
    def get_database_stats(self) -> Dict:
        """获取数据库统计信息"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            stats = {}
            
            # 教学视频数量
            cursor.execute('SELECT COUNT(*) FROM reference_videos')
            stats['reference_videos_count'] = cursor.fetchone()[0]
            
            # 用户视频数量
            cursor.execute('SELECT COUNT(*) FROM user_videos')
            stats['user_videos_count'] = cursor.fetchone()[0]
            
            # 比较记录数量
            cursor.execute('SELECT COUNT(*) FROM comparison_records')
            stats['comparison_records_count'] = cursor.fetchone()[0]
            
            # 姿势数据数量
            cursor.execute('SELECT COUNT(*) FROM pose_data')
            stats['pose_data_count'] = cursor.fetchone()[0]
            
            # 已提取姿势数据的视频数量
            cursor.execute('SELECT COUNT(*) FROM reference_videos WHERE pose_data_extracted = TRUE')
            stats['reference_videos_with_pose'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM user_videos WHERE pose_data_extracted = TRUE')
            stats['user_videos_with_pose'] = cursor.fetchone()[0]
            
            conn.close()
            return stats
        except Exception as e:
            print(f"获取数据库统计信息失败: {e}")
            return {}

# 全局数据库实例
db = DanceDatabase()
