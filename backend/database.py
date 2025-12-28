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
        conn = sqlite3.connect(self.db_path, timeout=30)  # 增加超时时间
        conn.row_factory = sqlite3.Row  # 使查询结果可以通过列名访问
        conn.execute("PRAGMA journal_mode=WAL")  # 使用WAL模式提高并发性能
        conn.execute("PRAGMA busy_timeout=30000")  # 30秒超时
        return conn
    
    def init_database(self):
        """初始化数据库表"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # 创建用户表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT,
                avatar_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            )
        ''')
        
        # 创建用户会话表（存储Token）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
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
                title TEXT,
                thumbnail_path TEXT
            )
        ''')
        
        # 为已存在的表添加新字段（如果不存在）
        try:
            cursor.execute("ALTER TABLE reference_videos ADD COLUMN thumbnail_path TEXT")
            print("已添加 thumbnail_path 字段到 reference_videos 表")
        except sqlite3.OperationalError:
            # 字段已存在，忽略错误
            pass
        
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
                pose_extraction_error TEXT,
                pose_extraction_progress INTEGER DEFAULT 0,
                user_id TEXT,
                session_id TEXT
            )
        ''')
        
        # 为已存在的user_videos表添加新字段（如果不存在）
        try:
            cursor.execute("ALTER TABLE user_videos ADD COLUMN pose_extraction_error TEXT")
            print("已添加 pose_extraction_error 字段到 user_videos 表")
        except sqlite3.OperationalError:
            pass
        
        try:
            cursor.execute("ALTER TABLE user_videos ADD COLUMN pose_extraction_progress INTEGER DEFAULT 0")
            print("已添加 pose_extraction_progress 字段到 user_videos 表")
        except sqlite3.OperationalError:
            pass
        
        try:
            cursor.execute("ALTER TABLE user_videos ADD COLUMN title TEXT")
            print("已添加 title 字段到 user_videos 表")
        except sqlite3.OperationalError:
            pass
        
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
        
        # 创建异步任务表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS async_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT UNIQUE NOT NULL,
                video_id TEXT NOT NULL,
                video_type TEXT NOT NULL,  -- 'reference' 或 'user'
                task_type TEXT NOT NULL,  -- 'pose_extraction' 或 'pose_video_generation'
                status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
                progress INTEGER DEFAULT 0,  -- 0-100
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        ''')
        
        # 创建评论表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                video_type TEXT NOT NULL,  -- 'reference' 或 'user'
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # 创建点赞表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                video_type TEXT NOT NULL,  -- 'reference' 或 'user'
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(video_id, video_type, user_id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # 创建索引以提高查询性能
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_reference_videos_video_id ON reference_videos(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_user_videos_video_id ON user_videos(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_comparison_records_comparison_id ON comparison_records(comparison_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pose_data_video_id ON pose_data(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_async_tasks_task_id ON async_tasks(task_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_async_tasks_video_id ON async_tasks(video_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id, video_type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_video_id ON likes(video_id, video_type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)')
        
        conn.commit()
        conn.close()
    
    def add_reference_video(self, video_id: str, filename: str, file_path: str, 
                           duration: float = None, fps: float = None, 
                           description: str = None, tags: str = None, author: str = None, title: str = None,
                           thumbnail_path: str = None) -> bool:
        """添加教学视频记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO reference_videos 
                (video_id, filename, file_path, duration, fps, description, tags, author, title, thumbnail_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (video_id, filename, file_path, duration, fps, description, tags, author, title, thumbnail_path))
            
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
                      user_id: str = None, session_id: str = None, title: str = None) -> bool:
        """添加用户视频记录"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO user_videos 
                (video_id, filename, file_path, duration, fps, user_id, session_id, title)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (video_id, filename, file_path, duration, fps, user_id, session_id, title))
            
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
    
    def update_pose_extraction_status(self, video_id: str, extracted: bool, video_type: str = 'user', error: str = None) -> bool:
        """更新姿势数据提取状态
        
        Args:
            video_id: 视频ID
            extracted: 是否提取完成
            video_type: 视频类型（'user' 或 'reference'）
            error: 错误信息（如果提取失败）
        """
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
                    SET pose_data_extracted = ?, pose_extraction_time = CURRENT_TIMESTAMP, pose_extraction_error = ?
                    WHERE video_id = ?
                ''', (extracted, error, video_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新姿势提取状态失败: {e}")
            return False
    
    def update_pose_extraction_progress(self, video_id: str, progress: int) -> bool:
        """更新姿势数据提取进度（0-100）"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE user_videos 
                SET pose_extraction_progress = ?
                WHERE video_id = ?
            ''', (progress, video_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新提取进度失败: {e}")
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
    
    def save_pose_data_batch(self, video_id: str, video_type: str, poses_data: Dict) -> bool:
        """批量保存姿势数据到数据库（性能优化版本）"""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 准备批量插入数据
            batch_data = []
            skipped_frames = 0
            for frame_index, pose_data in poses_data.items():
                # 跳过None值（无骨骼数据的帧）
                if pose_data is None:
                    skipped_frames += 1
                    continue
                
                pose_data_json = json.dumps(pose_data)
                timestamp = frame_index * 0.2  # 假设5fps，每帧0.2秒
                batch_data.append((video_id, video_type, frame_index, pose_data_json, timestamp))
            
            if skipped_frames > 0:
                print(f"[批量保存] 跳过 {skipped_frames} 个无骨骼数据的帧")
            
            # 如果没有有效数据，直接返回成功（无需插入）
            if len(batch_data) == 0:
                print(f"[批量保存] 没有有效的骨骼数据需要保存")
                conn.close()
                return True
            
            # 批量插入
            print(f"[批量保存] 准备保存 {len(batch_data)} 条骨骼数据")
            cursor.executemany('''
                INSERT OR REPLACE INTO pose_data 
                (video_id, video_type, frame_index, pose_data, timestamp)
                VALUES (?, ?, ?, ?, ?)
            ''', batch_data)
            
            conn.commit()
            conn.close()
            print(f"[批量保存] 成功保存 {len(batch_data)} 条骨骼数据")
            return True
        except Exception as e:
            print(f"[批量保存] 批量保存姿势数据失败: {e}")
            import traceback
            traceback.print_exc()
            if conn:
                try:
                    conn.close()
                except:
                    pass
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

    # ========== 用户认证相关方法 ==========
    
    def create_user(self, username: str, password_hash: str, email: str = None) -> bool:
        """创建新用户"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO users (username, password_hash, email)
                VALUES (?, ?, ?)
            ''', (username, password_hash, email))
            
            conn.commit()
            conn.close()
            return True
        except sqlite3.IntegrityError:
            print(f"用户名 {username} 已存在")
            return False
        except Exception as e:
            print(f"创建用户失败: {e}")
            return False
    
    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """根据用户名获取用户信息"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取用户信息失败: {e}")
            return None
    
    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """根据用户ID获取用户信息"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取用户信息失败: {e}")
            return None
    
    def update_last_login(self, user_id: int) -> bool:
        """更新用户最后登录时间"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (user_id,))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新最后登录时间失败: {e}")
            return False
    
    def save_session(self, user_id: int, token: str, expires_at: str) -> bool:
        """保存用户会话"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO user_sessions (user_id, token, expires_at)
                VALUES (?, ?, ?)
            ''', (user_id, token, expires_at))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"保存会话失败: {e}")
            return False
    
    def get_session_by_token(self, token: str) -> Optional[Dict]:
        """根据Token获取会话信息"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM user_sessions WHERE token = ?', (token,))
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取会话信息失败: {e}")
            return None
    
    def delete_session(self, token: str) -> bool:
        """删除会话（注销）"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('DELETE FROM user_sessions WHERE token = ?', (token,))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"删除会话失败: {e}")
            return False
    
    # ========== 异步任务管理方法 ==========
    
    def create_async_task(self, task_id: str, video_id: str, video_type: str, task_type: str) -> bool:
        """创建异步任务"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO async_tasks (task_id, video_id, video_type, task_type, status)
                VALUES (?, ?, ?, ?, 'pending')
            ''', (task_id, video_id, video_type, task_type))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"创建异步任务失败: {e}")
            return False
    
    def update_task_status(self, task_id: str, status: str, progress: int = None, 
                          error_message: str = None) -> bool:
        """更新任务状态"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if status == 'processing' and progress is None:
                cursor.execute('''
                    UPDATE async_tasks 
                    SET status = ?, started_at = CURRENT_TIMESTAMP
                    WHERE task_id = ?
                ''', (status, task_id))
            elif status == 'completed':
                cursor.execute('''
                    UPDATE async_tasks 
                    SET status = ?, progress = 100, completed_at = CURRENT_TIMESTAMP
                    WHERE task_id = ?
                ''', (status, task_id))
            elif status == 'failed':
                cursor.execute('''
                    UPDATE async_tasks 
                    SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP
                    WHERE task_id = ?
                ''', (status, error_message, task_id))
            else:
                cursor.execute('''
                    UPDATE async_tasks 
                    SET status = ?, progress = ?
                    WHERE task_id = ?
                ''', (status, progress or 0, task_id))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"更新任务状态失败: {e}")
            return False
    
    def get_task_status(self, task_id: str) -> Optional[Dict]:
        """获取任务状态"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM async_tasks WHERE task_id = ?', (task_id,))
            row = cursor.fetchone()
            conn.close()
            
            return dict(row) if row else None
        except Exception as e:
            print(f"获取任务状态失败: {e}")
            return None
    
    def get_tasks_by_video(self, video_id: str) -> List[Dict]:
        """获取视频相关的所有任务"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM async_tasks 
                WHERE video_id = ?
                ORDER BY created_at DESC
            ''', (video_id,))
            
            tasks = []
            for row in cursor.fetchall():
                tasks.append(dict(row))
            
            conn.close()
            return tasks
        except Exception as e:
            print(f"获取视频任务列表失败: {e}")
            return []
    
    # ========== 评论相关方法 ==========
    
    def add_comment(self, video_id: str, video_type: str, user_id: int, content: str) -> bool:
        """添加评论"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO comments (video_id, video_type, user_id, content)
                VALUES (?, ?, ?, ?)
            ''', (video_id, video_type, user_id, content))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"添加评论失败: {e}")
            return False
    
    def get_comments(self, video_id: str, video_type: str = None) -> List[Dict]:
        """获取视频的评论列表"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            if video_type:
                cursor.execute('''
                    SELECT c.*, u.username
                    FROM comments c
                    JOIN users u ON c.user_id = u.id
                    WHERE c.video_id = ? AND c.video_type = ?
                    ORDER BY c.created_at DESC
                ''', (video_id, video_type))
            else:
                cursor.execute('''
                    SELECT c.*, u.username
                    FROM comments c
                    JOIN users u ON c.user_id = u.id
                    WHERE c.video_id = ?
                    ORDER BY c.created_at DESC
                ''', (video_id,))
            
            comments = []
            for row in cursor.fetchall():
                comments.append(dict(row))
            
            conn.close()
            return comments
        except Exception as e:
            print(f"获取评论列表失败: {e}")
            return []
    
    def toggle_like(self, video_id: str, video_type: str, user_id: int) -> Tuple[bool, bool]:
        """
        切换点赞状态（如果已点赞则取消，未点赞则点赞）
        返回: (是否成功, 当前是否已点赞)
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 检查是否已点赞
            cursor.execute('''
                SELECT id FROM likes 
                WHERE video_id = ? AND video_type = ? AND user_id = ?
            ''', (video_id, video_type, user_id))
            
            existing_like = cursor.fetchone()
            
            if existing_like:
                # 取消点赞
                cursor.execute('''
                    DELETE FROM likes 
                    WHERE video_id = ? AND video_type = ? AND user_id = ?
                ''', (video_id, video_type, user_id))
                conn.commit()
                conn.close()
                return True, False
            else:
                # 添加点赞
                cursor.execute('''
                    INSERT INTO likes (video_id, video_type, user_id)
                    VALUES (?, ?, ?)
                ''', (video_id, video_type, user_id))
                conn.commit()
                conn.close()
                return True, True
        except Exception as e:
            print(f"切换点赞状态失败: {e}")
            return False, False
    
    def get_like_count(self, video_id: str, video_type: str) -> int:
        """获取视频的点赞数量"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) as count FROM likes 
                WHERE video_id = ? AND video_type = ?
            ''', (video_id, video_type))
            
            result = cursor.fetchone()
            count = result['count'] if result else 0
            
            conn.close()
            return count
        except Exception as e:
            print(f"获取点赞数量失败: {e}")
            return 0
    
    def is_liked(self, video_id: str, video_type: str, user_id: int) -> bool:
        """检查用户是否已点赞该视频"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT id FROM likes 
                WHERE video_id = ? AND video_type = ? AND user_id = ?
            ''', (video_id, video_type, user_id))
            
            result = cursor.fetchone()
            conn.close()
            return result is not None
        except Exception as e:
            print(f"检查点赞状态失败: {e}")
            return False

# 全局数据库实例
db = DanceDatabase()
