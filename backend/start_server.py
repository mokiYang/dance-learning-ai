#!/usr/bin/env python3
"""
舞蹈姿势对比服务启动脚本
"""

import os
import sys
import subprocess
import time

def check_dependencies():
    """检查依赖是否安装"""
    required_packages = [
        'flask',
        'flask_cors', 
        'opencv-python',
        'mediapipe',
        'numpy',
        'werkzeug'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        print("缺少以下依赖包:")
        for package in missing_packages:
            print(f"  - {package}")
        print("\n请运行以下命令安装依赖:")
        print("pip install -r requirements.txt")
        return False
    
    return True

def create_directories():
    """创建必要的目录"""
    directories = ['uploads', 'temp']
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print(f"创建目录: {directory}")

def init_database():
    """初始化数据库"""
    try:
        from database import db
        print("数据库初始化完成")
        return True
    except Exception as e:
        print(f"数据库初始化失败: {e}")
        return False

def main():
    print("=" * 50)
    print("舞蹈姿势对比服务")
    print("=" * 50)
    
    # 检查依赖
    # print("检查依赖...")
    # if not check_dependencies():
    #     sys.exit(1)
    
    # 创建目录
    print("创建必要目录...")
    create_directories()
    
    # 初始化数据库
    print("初始化数据库...")
    if not init_database():
        sys.exit(1)
    
    # 启动服务
    print("启动Flask服务...")
    print("服务地址: http://localhost:8128")
    print("API文档:")
    print("  - 健康检查: GET /api/health")
    print("  - 上传参考视频: POST /api/upload-reference")
    print("  - 列出参考视频: GET /api/reference-videos")
    print("  - 列出用户视频: GET /api/user-videos")
    print("  - 比较视频: POST /api/compare-videos")
    print("  - 获取报告: GET /api/get-report/<work_id>")
    print("  - 获取姿势数据: GET /api/videos/<video_id>/pose-data")
    print("  - 删除视频: DELETE /api/videos/<video_id>")
    print("  - 数据库统计: GET /api/database/stats")
    print("\n按 Ctrl+C 停止服务")
    print("-" * 50)
    
    try:
        # 启动Flask应用
        from app import app
        app.run(host='0.0.0.0', port=8128, debug=True)
    except KeyboardInterrupt:
        print("\n服务已停止")
    except Exception as e:
        print(f"启动服务时出错: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
