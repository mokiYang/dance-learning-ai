#!/usr/bin/env python3
"""
测试优化后的骨骼点位提取和视频生成功能
"""

import os
import sys
import time
from app import extract_poses_from_video, generate_pose_video

def test_landmark_optimization():
    """测试骨骼点位优化效果"""
    print("=== 骨骼点位优化测试 ===")
    
    # 测试视频文件路径（需要替换为实际存在的视频文件）
    test_video = "video_storage/videos/78e3854c141373ab.mp4"
    
    if not os.path.exists(test_video):
        print(f"测试视频文件不存在: {test_video}")
        print("请确保有可用的测试视频文件")
        return
    
    print(f"使用测试视频: {test_video}")
    
    # 测试骨骼点位提取
    print("\n1. 测试骨骼点位提取...")
    start_time = time.time()
    
    poses_data = extract_poses_from_video(
        test_video, 
        n=5, 
        output_dir="test_poses"
    )
    
    extraction_time = time.time() - start_time
    print(f"提取完成，用时: {extraction_time:.2f}秒")
    print(f"提取到 {len(poses_data)} 帧骨骼数据")
    
    # 分析每个帧的点位数量
    if poses_data:
        first_frame = list(poses_data.values())[0]
        print(f"每帧提取 {len(first_frame)} 个关键点位")
        print("关键点位包括: 鼻子、肩膀、肘部、手腕、髋部、膝盖、脚踝")
    
    # 测试视频生成（带音频）
    print("\n2. 测试视频生成（带音频）...")
    start_time = time.time()
    
    output_video = "test_pose_video_with_audio.mp4"
    generate_pose_video(test_video, output_video, n=5)
    
    generation_time = time.time() - start_time
    print(f"视频生成完成，用时: {generation_time:.2f}秒")
    
    if os.path.exists(output_video):
        file_size = os.path.getsize(output_video) / (1024 * 1024)  # MB
        print(f"生成视频文件大小: {file_size:.2f} MB")
        print(f"输出文件: {output_video}")
    else:
        print("视频生成失败")
    
    # 清理测试文件
    print("\n3. 清理测试文件...")
    if os.path.exists("test_poses"):
        import shutil
        shutil.rmtree("test_poses")
        print("已清理测试骨骼数据目录")
    
    print("\n=== 测试完成 ===")

def show_landmark_info():
    """显示关键点位信息"""
    print("\n=== 优化后的关键点位信息 ===")
    
    landmarks_info = {
        0: "鼻子 - 头部位置",
        11: "左肩 - 上半身姿态", 
        12: "右肩 - 上半身姿态",
        13: "左肘 - 手臂动作",
        14: "右肘 - 手臂动作", 
        15: "左手腕 - 手部位置",
        16: "右手腕 - 手部位置",
        23: "左髋 - 下半身姿态",
        24: "右髋 - 下半身姿态",
        25: "左膝 - 腿部动作",
        26: "右膝 - 腿部动作",
        27: "左脚踝 - 脚部位置",
        28: "右脚踝 - 脚部位置"
    }
    
    print(f"总共使用 {len(landmarks_info)} 个关键点位（相比MediaPipe的33个点位减少了 {33-len(landmarks_info)} 个）")
    print("\n关键点位详情:")
    for idx, desc in landmarks_info.items():
        print(f"  {idx:2d}: {desc}")
    
    print("\n优化效果:")
    print("- 减少了60%的数据量，提高处理速度")
    print("- 保留舞蹈动作分析最核心的点位")
    print("- 降低存储空间需求")
    print("- 提高姿势对比的准确性")

if __name__ == "__main__":
    show_landmark_info()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_landmark_optimization()
    else:
        print("\n运行 'python test_optimized_landmarks.py --test' 进行完整测试")
