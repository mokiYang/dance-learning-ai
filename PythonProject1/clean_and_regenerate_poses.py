#!/usr/bin/env python3
"""
清理旧的骨骼数据并重新生成优化后的数据
"""

import os
import sys
import shutil
from database import DanceDatabase
from app import extract_poses_from_video, generate_pose_video

def clean_old_pose_data():
    """清理旧的骨骼数据"""
    print("=== 清理旧的骨骼数据 ===")
    
    db = DanceDatabase()
    
    # 获取所有参考视频
    reference_videos = db.get_reference_videos()
    print(f"找到 {len(reference_videos)} 个参考视频")
    
    cleaned_count = 0
    
    for video in reference_videos:
        video_id = video['video_id']
        filename = video['filename']
        
        print(f"\n处理视频: {filename} (ID: {video_id})")
        
        # 1. 删除数据库中的骨骼数据
        try:
            conn = db.get_connection()
            cursor = conn.cursor()
            
            # 删除姿势数据
            cursor.execute('DELETE FROM pose_data WHERE video_id = ?', (video_id,))
            deleted_poses = cursor.rowcount
            
            # 重置骨骼数据提取状态
            cursor.execute('''
                UPDATE reference_videos 
                SET pose_data_extracted = FALSE, 
                    pose_data_path = NULL,
                    pose_extraction_time = NULL,
                    pose_video_generated = FALSE,
                    pose_video_path = NULL,
                    pose_video_generation_time = NULL
                WHERE video_id = ?
            ''', (video_id,))
            
            conn.commit()
            conn.close()
            
            print(f"  - 删除了 {deleted_poses} 条骨骼数据记录")
            
        except Exception as e:
            print(f"  - 清理数据库记录失败: {e}")
            continue
        
        # 2. 删除文件系统中的骨骼数据目录
        try:
            if video.get('pose_data_path') and os.path.exists(video['pose_data_path']):
                shutil.rmtree(video['pose_data_path'], ignore_errors=True)
                print(f"  - 删除了骨骼数据目录: {video['pose_data_path']}")
            
            # 删除标记骨骼视频
            if video.get('pose_video_path') and os.path.exists(video['pose_video_path']):
                os.remove(video['pose_video_path'])
                print(f"  - 删除了标记骨骼视频: {video['pose_video_path']}")
                
        except Exception as e:
            print(f"  - 清理文件失败: {e}")
        
        cleaned_count += 1
    
    print(f"\n清理完成，共处理了 {cleaned_count} 个视频")
    return cleaned_count

def regenerate_pose_data():
    """重新生成优化后的骨骼数据"""
    print("\n=== 重新生成优化后的骨骼数据 ===")
    
    db = DanceDatabase()
    reference_videos = db.get_reference_videos()
    
    regenerated_count = 0
    
    for video in reference_videos:
        video_id = video['video_id']
        filename = video['filename']
        file_path = video['file_path']
        
        print(f"\n重新生成: {filename} (ID: {video_id})")
        
        # 检查视频文件是否存在
        if not os.path.exists(file_path):
            print(f"  - 视频文件不存在: {file_path}")
            continue
        
        try:
            # 创建输出目录
            output_dir = os.path.join("video_storage", f"reference_poses_{video_id}")
            os.makedirs(output_dir, exist_ok=True)
            
            # 提取优化后的骨骼数据（13个关键点位）
            print("  - 提取骨骼数据...")
            poses_data = extract_poses_from_video(
                file_path, 
                n=5, 
                output_dir=output_dir
            )
            
            print(f"  - 提取到 {len(poses_data)} 帧骨骼数据")
            
            # 保存骨骼数据到数据库
            for frame_idx, pose_data in poses_data.items():
                db.save_pose_data(video_id, 'reference', frame_idx, pose_data, frame_idx * 0.2)
            
            # 更新姿势数据路径和状态
            db.update_pose_data_path(video_id, output_dir, 'reference')
            db.update_pose_extraction_status(video_id, True, 'reference')
            
            # 生成标记骨骼的视频（带音频）
            print("  - 生成标记骨骼视频...")
            pose_video_path = os.path.join(output_dir, "pose_video.mp4")
            generate_pose_video(file_path, pose_video_path, n=5)
            
            # 更新标记骨骼视频路径
            db.update_pose_video_path(video_id, pose_video_path)
            
            print(f"  - 完成！骨骼数据: {len(poses_data)} 帧")
            regenerated_count += 1
            
        except Exception as e:
            print(f"  - 重新生成失败: {e}")
            continue
    
    print(f"\n重新生成完成，共处理了 {regenerated_count} 个视频")
    return regenerated_count

def verify_optimization():
    """验证优化效果"""
    print("\n=== 验证优化效果 ===")
    
    db = DanceDatabase()
    reference_videos = db.get_reference_videos()
    
    for video in reference_videos:
        video_id = video['video_id']
        filename = video['filename']
        
        # 获取骨骼数据
        pose_data_list = db.get_pose_data(video_id)
        if pose_data_list:
            first_pose = pose_data_list[0]['pose_data']
            landmark_count = len(first_pose)
            print(f"{filename}: {landmark_count} 个关键点位")
            
            if landmark_count == 13:
                print(f"  ✅ 已优化（13个核心点位）")
            elif landmark_count == 33:
                print(f"  ❌ 未优化（33个完整点位）")
            else:
                print(f"  ⚠️  异常（{landmark_count}个点位）")
        else:
            print(f"{filename}: 无骨骼数据")

def main():
    """主函数"""
    print("舞蹈学习系统 - 骨骼数据清理和重新生成工具")
    print("=" * 50)
    
    if len(sys.argv) > 1 and sys.argv[1] == "--clean-only":
        # 只清理，不重新生成
        clean_old_pose_data()
        return
    
    if len(sys.argv) > 1 and sys.argv[1] == "--verify-only":
        # 只验证
        verify_optimization()
        return
    
    # 完整流程：清理 + 重新生成 + 验证
    print("开始完整的数据清理和重新生成流程...")
    
    # 1. 清理旧数据
    cleaned_count = clean_old_pose_data()
    
    if cleaned_count == 0:
        print("没有找到需要清理的数据")
        return
    
    # 2. 重新生成优化后的数据
    regenerated_count = regenerate_pose_data()
    
    # 3. 验证优化效果
    verify_optimization()
    
    print("\n" + "=" * 50)
    print("数据清理和重新生成完成！")
    print(f"清理了 {cleaned_count} 个视频的旧数据")
    print(f"重新生成了 {regenerated_count} 个视频的优化数据")

if __name__ == "__main__":
    main()
