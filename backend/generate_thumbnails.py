#!/usr/bin/env python3
"""
为已有的视频批量生成缩略图
"""
import os
import cv2
from database import db

def generate_thumbnail(video_path, thumbnail_folder='thumbnails'):
    """生成视频缩略图"""
    try:
        if not os.path.exists(thumbnail_folder):
            os.makedirs(thumbnail_folder)
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        target_frame = min(int(fps), total_frames // 2) if fps > 0 else 0
        
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return None
        
        video_basename = os.path.basename(video_path)
        video_name = os.path.splitext(video_basename)[0]
        thumbnail_filename = f"{video_name}_thumb.jpg"
        thumbnail_path = os.path.join(thumbnail_folder, thumbnail_filename)
        
        height, width = frame.shape[:2]
        if width > 640:
            scale = 640 / width
            frame = cv2.resize(frame, (640, int(height * scale)))
        
        cv2.imwrite(thumbnail_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(f"✓ 生成缩略图: {thumbnail_path}")
        return thumbnail_path
        
    except Exception as e:
        print(f"✗ 生成缩略图失败: {str(e)}")
        return None

def main():
    """主函数"""
    print("开始为现有视频生成缩略图...")
    
    videos = db.get_reference_videos()
    total = len(videos)
    success = 0
    
    for idx, video in enumerate(videos, 1):
        print(f"\n[{idx}/{total}] 处理视频: {video['filename']}")
        
        if video.get('thumbnail_path'):
            print("  已有缩略图，跳过")
            continue
        
        video_path = video['file_path']
        if not os.path.exists(video_path):
            print(f"  视频文件不存在: {video_path}")
            continue
        
        thumbnail_path = generate_thumbnail(video_path)
        if thumbnail_path:
            # 更新数据库
            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE reference_videos SET thumbnail_path = ? WHERE video_id = ?',
                (thumbnail_path, video['video_id'])
            )
            conn.commit()
            conn.close()
            success += 1
            print("  数据库已更新")
    
    print(f"\n完成！成功生成 {success}/{total} 个缩略图")

if __name__ == '__main__':
    main()
