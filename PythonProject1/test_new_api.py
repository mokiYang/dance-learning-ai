#!/usr/bin/env python3
"""
测试新的API功能
验证服务不再需要每次都上传教学视频
"""

import requests
import json
import os

# 服务地址
BASE_URL = "http://localhost:8128"

def test_health_check():
    """测试健康检查"""
    print("1. 测试健康检查...")
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        if response.status_code == 200:
            print("✓ 健康检查通过")
            print(f"  响应: {response.json()}")
        else:
            print(f"✗ 健康检查失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 健康检查异常: {e}")

def test_get_reference_videos():
    """测试获取参考视频列表"""
    print("\n2. 测试获取参考视频列表...")
    try:
        response = requests.get(f"{BASE_URL}/api/reference-videos")
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                videos = data['videos']
                print(f"✓ 获取到 {len(videos)} 个参考视频:")
                for video in videos:
                    print(f"  - {video['filename']} (ID: {video['video_id']})")
                    print(f"    时长: {video['duration']:.2f}秒, 帧率: {video['fps']:.2f} FPS")
                    print(f"    已提取姿势数据: {video.get('has_pose_data', False)}")
            else:
                print(f"✗ 获取参考视频失败: {data.get('error', '未知错误')}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取参考视频异常: {e}")

def test_get_default_reference_video():
    """测试获取默认参考视频"""
    print("\n3. 测试获取默认参考视频...")
    try:
        response = requests.get(f"{BASE_URL}/api/reference-videos/default")
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                video = data['video']
                print(f"✓ 默认参考视频: {video['filename']}")
                print(f"  ID: {video['video_id']}")
                print(f"  时长: {video['duration']:.2f}秒, 帧率: {video['fps']:.2f} FPS")
                print(f"  已提取姿势数据: {video.get('has_pose_data', False)}")
            else:
                print(f"✗ 获取默认参考视频失败: {data.get('error', '未知错误')}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取默认参考视频异常: {e}")

def test_database_stats():
    """测试数据库统计"""
    print("\n4. 测试数据库统计...")
    try:
        response = requests.get(f"{BASE_URL}/api/database/stats")
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                stats = data['stats']
                print("✓ 数据库统计信息:")
                for key, value in stats.items():
                    print(f"  {key}: {value}")
            else:
                print(f"✗ 获取数据库统计失败: {data.get('error', '未知错误')}")
        else:
            print(f"✗ 请求失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取数据库统计异常: {e}")

def test_compare_videos_without_reference():
    """测试不需要上传参考视频的比较功能"""
    print("\n5. 测试比较功能（不需要上传参考视频）...")
    
    # 检查是否有用户视频文件
    user_video_path = "uploads/recorded_video.mp4"
    if not os.path.exists(user_video_path):
        print(f"✗ 用户视频文件不存在: {user_video_path}")
        return
    
    try:
        with open(user_video_path, 'rb') as f:
            files = {'user_video': ('recorded_video.mp4', f, 'video/mp4')}
            data = {'threshold': 0.3}
            
            response = requests.post(f"{BASE_URL}/api/compare-videos", files=files, data=data)
            
            if response.status_code == 200:
                result = response.json()
                if result['success']:
                    print("✓ 视频比较成功！")
                    print(f"  工作ID: {result['work_id']}")
                    print(f"  参考视频: {result['video_info']['reference']['filename']}")
                    print(f"  用户视频: {result['video_info']['user']['filename']}")
                    print(f"  差异帧数: {result['comparison']['total_differences']}")
                    print(f"  报告路径: {result['report_path']}")
                else:
                    print(f"✗ 视频比较失败: {result.get('error', '未知错误')}")
            else:
                print(f"✗ 请求失败: {response.status_code}")
                print(f"  响应: {response.text}")
    except Exception as e:
        print(f"✗ 视频比较异常: {e}")

def main():
    """主函数"""
    print("=" * 60)
    print("舞蹈学习系统 - 新API功能测试")
    print("=" * 60)
    
    # 检查服务是否运行
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=5)
        if response.status_code != 200:
            print("✗ 服务未运行，请先启动服务: python app.py")
            return
    except:
        print("✗ 服务未运行，请先启动服务: python app.py")
        return
    
    # 执行测试
    test_health_check()
    test_get_reference_videos()
    test_get_default_reference_video()
    test_database_stats()
    test_compare_videos_without_reference()
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
