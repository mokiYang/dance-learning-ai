#!/usr/bin/env python3
"""
测试现有app.py中的视频流播放功能
"""

import requests
import os
import json

# 服务配置
BASE_URL = "http://localhost:8128"

def test_health_check():
    """测试健康检查"""
    print("1. 测试健康检查...")
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"健康检查失败: {e}")
        return False

def test_get_reference_videos():
    """测试获取参考视频列表"""
    print("\n2. 测试获取参考视频列表...")
    try:
        response = requests.get(f"{BASE_URL}/api/reference-videos")
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"参考视频列表: {json.dumps(result, indent=2, ensure_ascii=False)}")
            return result.get('videos', [])
        else:
            print(f"获取列表失败: {response.text}")
            return []
            
    except Exception as e:
        print(f"列表测试失败: {e}")
        return []

def test_video_stream(video_id):
    """测试视频流播放"""
    print(f"\n3. 测试视频流播放 (ID: {video_id})...")
    try:
        response = requests.get(f"{BASE_URL}/video/{video_id}", stream=True)
        print(f"状态码: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        print(f"Content-Length: {response.headers.get('Content-Length')}")
        
        if response.status_code == 200:
            # 读取前1KB来验证流
            chunk = next(response.iter_content(chunk_size=1024))
            print(f"视频流正常，前1KB大小: {len(chunk)} bytes")
            return True
        else:
            print(f"流播放失败: {response.text}")
            return False
            
    except Exception as e:
        print(f"流测试失败: {e}")
        return False

def test_range_requests(video_id):
    """测试范围请求（Range requests）"""
    print(f"\n4. 测试范围请求 (ID: {video_id})...")
    try:
        headers = {'Range': 'bytes=0-1023'}  # 请求前1KB
        response = requests.get(f"{BASE_URL}/video/{video_id}", headers=headers)
        print(f"状态码: {response.status_code}")
        print(f"Content-Range: {response.headers.get('Content-Range')}")
        print(f"Accept-Ranges: {response.headers.get('Accept-Ranges')}")
        
        if response.status_code == 206:
            print("范围请求支持正常")
            return True
        else:
            print("范围请求不支持或失败")
            return False
            
    except Exception as e:
        print(f"范围请求测试失败: {e}")
        return False

def test_video_stats():
    """测试视频统计信息"""
    print("\n5. 测试视频统计信息...")
    try:
        response = requests.get(f"{BASE_URL}/api/video-stats")
        print(f"状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"统计信息: {json.dumps(result, indent=2, ensure_ascii=False)}")
            return result.get('stats')
        else:
            print(f"获取统计失败: {response.text}")
            return None
            
    except Exception as e:
        print(f"统计测试失败: {e}")
        return None

def test_upload_reference_video():
    """测试上传参考视频"""
    print("\n6. 测试上传参考视频...")
    
    test_video_path = "test_video.mp4"
    if not os.path.exists(test_video_path):
        print(f"测试视频文件不存在: {test_video_path}")
        return None
    
    try:
        with open(test_video_path, 'rb') as f:
            files = {'video': f}
            data = {
                'title': '测试舞蹈视频',
                'description': '这是一个测试用的舞蹈教学视频',
                'author': '测试作者',
                'tags': '舞蹈,测试,教学'
            }
            
            response = requests.post(f"{BASE_URL}/api/upload-reference", files=files, data=data)
            print(f"状态码: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"上传成功: {json.dumps(result, indent=2, ensure_ascii=False)}")
                return result.get('video_id')
            else:
                print(f"上传失败: {response.text}")
                return None
                
    except Exception as e:
        print(f"上传测试失败: {e}")
        return None

def main():
    """主测试函数"""
    print("=" * 60)
    print("测试现有app.py中的视频流播放功能")
    print("=" * 60)
    
    # 检查服务是否运行
    if not test_health_check():
        print("服务未运行，请先启动舞蹈学习服务")
        print("启动命令: python app.py")
        return
    
    # 测试获取参考视频列表
    videos = test_get_reference_videos()
    
    if not videos:
        print("没有找到参考视频，尝试上传一个测试视频...")
        video_id = test_upload_reference_video()
        if not video_id:
            print("上传测试视频失败，跳过后续测试")
            return
    else:
        # 使用第一个视频进行测试
        video_id = videos[0]['video_id']
        print(f"使用现有视频进行测试: {video_id}")
    
    # 测试流播放
    test_video_stream(video_id)
    
    # 测试范围请求
    test_range_requests(video_id)
    
    # 测试统计
    test_video_stats()
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
    
    if video_id:
        print(f"\n测试视频访问地址:")
        print(f"播放: http://localhost:8128/video/{video_id}")
        print(f"信息: http://localhost:8128/api/reference-videos")
    
    print(f"\n服务地址: {BASE_URL}")
    print("可以在浏览器中直接访问视频播放地址进行测试")

if __name__ == '__main__':
    main()
