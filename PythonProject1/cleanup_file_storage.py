#!/usr/bin/env python3
"""
清理所有本地姿势数据文件存储，只保留数据库存储
"""

import os
import shutil
import glob

def cleanup_pose_file_storage():
    """清理所有本地姿势数据文件"""
    print("=== 清理本地姿势数据文件存储 ===")
    
    # 1. 删除根目录下的poses文件夹
    poses_dirs = [
        "./poses",
        "./reference_poses"
    ]
    
    for poses_dir in poses_dirs:
        if os.path.exists(poses_dir):
            print(f"删除目录: {poses_dir}")
            shutil.rmtree(poses_dir)
        else:
            print(f"目录不存在: {poses_dir}")
    
    # 2. 删除video_storage下的reference_poses目录
    video_storage_ref_poses = glob.glob("./video_storage/reference_poses_*")
    for ref_poses_dir in video_storage_ref_poses:
        if os.path.exists(ref_poses_dir):
            print(f"删除目录: {ref_poses_dir}")
            shutil.rmtree(ref_poses_dir)
    
    # 3. 删除uploads下的reference_poses目录
    uploads_ref_poses = glob.glob("./uploads/reference_poses_*")
    for ref_poses_dir in uploads_ref_poses:
        if os.path.exists(ref_poses_dir):
            print(f"删除目录: {ref_poses_dir}")
            shutil.rmtree(ref_poses_dir)
    
    # 4. 删除temp下的user_poses目录
    temp_user_poses = glob.glob("./temp/user_*/user_poses")
    for user_poses_dir in temp_user_poses:
        if os.path.exists(user_poses_dir):
            print(f"删除目录: {user_poses_dir}")
            shutil.rmtree(user_poses_dir)
    
    # 5. 删除所有pose_*.txt文件
    pose_files = glob.glob("./**/pose_*.txt", recursive=True)
    for pose_file in pose_files:
        if os.path.exists(pose_file):
            print(f"删除文件: {pose_file}")
            os.remove(pose_file)
    
    print("\n=== 清理完成 ===")
    print("所有本地姿势数据文件已删除，只保留数据库存储")

def verify_cleanup():
    """验证清理结果"""
    print("\n=== 验证清理结果 ===")
    
    # 检查是否还有姿势数据文件
    remaining_poses_dirs = glob.glob("./**/poses", recursive=True)
    remaining_ref_poses = glob.glob("./**/reference_poses*", recursive=True)
    remaining_user_poses = glob.glob("./**/user_poses", recursive=True)
    remaining_pose_files = glob.glob("./**/pose_*.txt", recursive=True)
    
    print(f"剩余poses目录: {len(remaining_poses_dirs)}")
    print(f"剩余reference_poses目录: {len(remaining_ref_poses)}")
    print(f"剩余user_poses目录: {len(remaining_user_poses)}")
    print(f"剩余pose_*.txt文件: {len(remaining_pose_files)}")
    
    if len(remaining_poses_dirs) == 0 and len(remaining_ref_poses) == 0 and len(remaining_user_poses) == 0 and len(remaining_pose_files) == 0:
        print("✅ 清理成功！所有本地姿势数据文件已删除")
    else:
        print("⚠️ 仍有文件未清理完成")
        if remaining_poses_dirs:
            print(f"剩余poses目录: {remaining_poses_dirs}")
        if remaining_ref_poses:
            print(f"剩余reference_poses目录: {remaining_ref_poses}")
        if remaining_user_poses:
            print(f"剩余user_poses目录: {remaining_user_poses}")
        if remaining_pose_files:
            print(f"剩余pose_*.txt文件: {remaining_pose_files}")

if __name__ == "__main__":
    cleanup_pose_file_storage()
    verify_cleanup()
