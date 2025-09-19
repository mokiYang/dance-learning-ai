#!/usr/bin/env python3
"""
调试视频URL无法播放的问题
"""

import requests
import os
import subprocess
import json

def debug_video_url():
    """调试视频URL无法播放的问题"""
    
    print("=== 调试视频URL无法播放的问题 ===\n")
    
    work_id = "936e4b39-2755-4d55-a058-e137a8c14f5f"
    base_url = "http://localhost:8128"
    
    # 1. 检查后端服务状态
    print("1. 检查后端服务状态...")
    try:
        response = requests.get(f"{base_url}/api/health")
        if response.status_code == 200:
            print("   ✓ 后端服务正常运行")
        else:
            print(f"   ✗ 后端服务异常: {response.status_code}")
            return
    except Exception as e:
        print(f"   ✗ 后端服务连接失败: {e}")
        return
    
    # 2. 检查视频文件是否存在
    print("\n2. 检查视频文件是否存在...")
    report_dir = f"temp/report_{work_id}"
    reference_file = f"{report_dir}/reference_pose_video.mp4"
    user_file = f"{report_dir}/user_pose_video.mp4"
    
    if os.path.exists(reference_file):
        print(f"   ✓ 参考视频文件存在: {reference_file}")
        print(f"     文件大小: {os.path.getsize(reference_file)} bytes")
    else:
        print(f"   ✗ 参考视频文件不存在: {reference_file}")
        return
    
    if os.path.exists(user_file):
        print(f"   ✓ 用户视频文件存在: {user_file}")
        print(f"     文件大小: {os.path.getsize(user_file)} bytes")
    else:
        print(f"   ✗ 用户视频文件不存在: {user_file}")
        return
    
    # 3. 测试视频文件完整性
    print("\n3. 测试视频文件完整性...")
    try:
        import cv2
        cap = cv2.VideoCapture(reference_file)
        if cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration = frame_count / fps if fps > 0 else 0
            
            print(f"   ✓ 参考视频文件完整")
            print(f"     分辨率: {width}x{height}")
            print(f"     帧率: {fps:.2f} FPS")
            print(f"     总帧数: {frame_count}")
            print(f"     时长: {duration:.2f}秒")
            
            # 尝试读取第一帧
            ret, frame = cap.read()
            if ret:
                print("   ✓ 可以正常读取视频帧")
            else:
                print("   ✗ 无法读取视频帧")
            
            cap.release()
        else:
            print("   ✗ 无法打开视频文件")
    except Exception as e:
        print(f"   ✗ 视频文件检查异常: {e}")
    
    # 4. 测试API响应
    print("\n4. 测试API响应...")
    reference_url = f"{base_url}/api/pose-video/{work_id}/reference"
    
    try:
        # 测试HEAD请求
        response = requests.head(reference_url)
        print(f"   HEAD请求状态码: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        print(f"   Content-Length: {response.headers.get('Content-Length')}")
        print(f"   Accept-Ranges: {response.headers.get('Accept-Ranges')}")
        print(f"   Cache-Control: {response.headers.get('Cache-Control')}")
        print(f"   Access-Control-Allow-Origin: {response.headers.get('Access-Control-Allow-Origin')}")
        
        if response.status_code == 200:
            print("   ✓ API响应正常")
        else:
            print(f"   ✗ API响应异常: {response.status_code}")
            return
            
    except Exception as e:
        print(f"   ✗ API请求异常: {e}")
        return
    
    # 5. 测试Range请求
    print("\n5. 测试Range请求...")
    try:
        headers = {'Range': 'bytes=0-1023'}
        response = requests.get(reference_url, headers=headers)
        print(f"   Range请求状态码: {response.status_code}")
        print(f"   Content-Range: {response.headers.get('Content-Range')}")
        print(f"   响应大小: {len(response.content)} bytes")
        
        if response.status_code == 206:
            print("   ✓ Range请求支持正常")
        else:
            print(f"   ⚠ Range请求返回状态码: {response.status_code}")
            
    except Exception as e:
        print(f"   ✗ Range请求测试异常: {e}")
    
    # 6. 测试完整文件请求
    print("\n6. 测试完整文件请求...")
    try:
        response = requests.get(reference_url, stream=True)
        print(f"   完整文件请求状态码: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        print(f"   Content-Length: {response.headers.get('Content-Length')}")
        
        if response.status_code == 200:
            print("   ✓ 完整文件请求正常")
        else:
            print(f"   ✗ 完整文件请求异常: {response.status_code}")
            
    except Exception as e:
        print(f"   ✗ 完整文件请求异常: {e}")
    
    # 7. 检查浏览器兼容性
    print("\n7. 检查浏览器兼容性...")
    print("   建议在浏览器中测试以下URL:")
    print(f"   {reference_url}")
    print("   如果无法播放，可能的原因:")
    print("   1. 浏览器缓存问题 - 尝试硬刷新 (Ctrl+F5)")
    print("   2. 网络连接问题 - 检查网络连接")
    print("   3. 浏览器兼容性问题 - 尝试不同浏览器")
    print("   4. 视频格式问题 - 检查视频编码")
    
    # 8. 生成测试HTML
    print("\n8. 生成测试HTML...")
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>视频播放测试</title>
</head>
<body>
    <h1>视频播放测试</h1>
    <video controls width="800" height="600">
        <source src="{reference_url}" type="video/mp4">
        您的浏览器不支持视频播放
    </video>
    <p>测试URL: {reference_url}</p>
</body>
</html>
"""
    
    with open("test_video_debug.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    
    print("   ✓ 已生成测试HTML文件: test_video_debug.html")
    print("   可以在浏览器中打开此文件进行测试")
    
    print(f"\n=== 调试完成 ===")
    print("如果所有测试都通过，说明后端API是正常的。")
    print("如果前端无法播放，可能是前端代码或浏览器的问题。")

if __name__ == "__main__":
    debug_video_url()
