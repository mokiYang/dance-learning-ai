#!/usr/bin/env python3
"""
API测试脚本
用于测试舞蹈姿势对比服务的各个接口
"""

import requests
import json
import time
import os

# API基础URL
BASE_URL = "http://localhost:8128/api"

def test_health_check():
    """测试健康检查接口"""
    print("测试健康检查接口...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ 健康检查成功: {data['message']}")
            return True
        else:
            print(f"❌ 健康检查失败: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务器，请确保服务已启动")
        return False
    except Exception as e:
        print(f"❌ 健康检查出错: {e}")
        return False

def test_reference_videos():
    """测试获取参考视频列表接口"""
    print("\n测试获取参考视频列表接口...")
    try:
        response = requests.get(f"{BASE_URL}/reference-videos")
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                videos = data['videos']
                print(f"✅ 获取参考视频列表成功，共 {len(videos)} 个视频")
                for video in videos:
                    print(f"  - {video['filename']} ({video['duration']:.1f}s)")
                return True
            else:
                print(f"❌ 获取参考视频列表失败: {data.get('error', '未知错误')}")
                return False
        else:
            print(f"❌ 获取参考视频列表失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 获取参考视频列表出错: {e}")
        return False

def test_upload_reference_video():
    """测试上传参考视频接口"""
    print("\n测试上传参考视频接口...")
    
    # 检查是否有测试视频文件
    test_video_path = "test_video.mp4"
    if not os.path.exists(test_video_path):
        print(f"⚠️  测试视频文件 {test_video_path} 不存在，跳过上传测试")
        return True
    
    try:
        with open(test_video_path, 'rb') as f:
            files = {'video': (test_video_path, f, 'video/mp4')}
            response = requests.post(f"{BASE_URL}/upload-reference", files=files)
        
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                print(f"✅ 上传参考视频成功: {data['filename']}")
                print(f"  时长: {data['duration']:.1f}秒")
                print(f"  帧率: {data['fps']:.1f} FPS")
                return True
            else:
                print(f"❌ 上传参考视频失败: {data.get('error', '未知错误')}")
                return False
        else:
            print(f"❌ 上传参考视频失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 上传参考视频出错: {e}")
        return False

def test_compare_videos():
    """测试视频比较接口"""
    print("\n测试视频比较接口...")
    
    # 检查是否有测试视频文件
    test_video_path = "test_video.mp4"
    if not os.path.exists(test_video_path):
        print(f"⚠️  测试视频文件 {test_video_path} 不存在，跳过比较测试")
        return True
    
    try:
        with open(test_video_path, 'rb') as f1, open(test_video_path, 'rb') as f2:
            files = {
                'reference_video': (test_video_path, f1, 'video/mp4'),
                'user_video': (test_video_path, f2, 'video/mp4')
            }
            data = {'threshold': '0.3'}
            response = requests.post(f"{BASE_URL}/compare-videos", files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            if result['success']:
                print(f"✅ 视频比较成功")
                print(f"  工作ID: {result['work_id']}")
                print(f"  参考视频: {result['video_info']['reference']['filename']}")
                print(f"  用户视频: {result['video_info']['user']['filename']}")
                print(f"  差异帧数: {result['comparison']['total_differences']}")
                
                # 测试获取报告
                return test_get_report(result['work_id'])
            else:
                print(f"❌ 视频比较失败: {result.get('error', '未知错误')}")
                return False
        else:
            print(f"❌ 视频比较失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 视频比较出错: {e}")
        return False

def test_get_report(work_id):
    """测试获取报告接口"""
    print(f"\n测试获取报告接口 (工作ID: {work_id})...")
    try:
        response = requests.get(f"{BASE_URL}/get-report/{work_id}")
        if response.status_code == 200:
            data = response.json()
            if data['success']:
                print(f"✅ 获取报告成功")
                print(f"  报告长度: {len(data['report'])} 字符")
                # 显示报告的前几行
                lines = data['report'].split('\n')[:5]
                print("  报告预览:")
                for line in lines:
                    if line.strip():
                        print(f"    {line}")
                return True
            else:
                print(f"❌ 获取报告失败: {data.get('error', '未知错误')}")
                return False
        else:
            print(f"❌ 获取报告失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 获取报告出错: {e}")
        return False

def main():
    """主测试函数"""
    print("=" * 60)
    print("舞蹈姿势对比服务 API 测试")
    print("=" * 60)
    
    # 等待服务启动
    print("等待服务启动...")
    time.sleep(2)
    
    # 运行所有测试
    tests = [
        test_health_check,
        test_reference_videos,
        test_upload_reference_video,
        test_compare_videos
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    # 输出测试结果
    print("=" * 60)
    print(f"测试完成: {passed}/{total} 通过")
    if passed == total:
        print("🎉 所有测试通过！服务运行正常")
    else:
        print("⚠️  部分测试失败，请检查服务配置")
    print("=" * 60)

if __name__ == "__main__":
    main()
