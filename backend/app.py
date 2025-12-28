from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import cv2
import mediapipe as mp
import numpy as np
import tempfile
import shutil
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
from datetime import datetime, timedelta
from database import db
import jwt
from functools import wraps
import threading
import traceback

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# JWT 配置
SECRET_KEY = os.environ.get('SECRET_KEY', 'dance-learning-secret-key-change-in-production')
TOKEN_EXPIRY_DAYS = 365  # Token有效期365天（接近永久）

# 配置上传文件夹
# 自动检测运行环境：Docker 环境下使用 /app/temp，本地开发使用相对路径 temp
default_temp_folder = '/app/temp' if os.path.exists('/app') and os.access('/app', os.W_OK) else 'temp'
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
TEMP_FOLDER = os.environ.get('TEMP_FOLDER', default_temp_folder)
THUMBNAIL_FOLDER = os.environ.get('THUMBNAIL_FOLDER', 'thumbnails')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
if not os.path.exists(TEMP_FOLDER):
    os.makedirs(TEMP_FOLDER)
if not os.path.exists(THUMBNAIL_FOLDER):
    os.makedirs(THUMBNAIL_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB 限制

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ========== 认证相关函数 ==========

def generate_auth_token(user_id: int, username: str) -> str:
    """生成认证Token（365天有效期）"""
    payload = {
        'user_id': user_id,
        'username': username,
        'exp': datetime.utcnow() + timedelta(days=TOKEN_EXPIRY_DAYS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def verify_auth_token(token: str) -> dict:
    """验证Token并返回用户信息"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return {
            'valid': True,
            'user_id': payload['user_id'],
            'username': payload['username']
        }
    except jwt.ExpiredSignatureError:
        return {'valid': False, 'error': 'Token已过期'}
    except jwt.InvalidTokenError:
        return {'valid': False, 'error': 'Token无效'}

def require_auth(f):
    """认证装饰器 - 保护需要登录的接口"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
        
        if not token:
            return jsonify({'success': False, 'error': '未登录'}), 401
        
        result = verify_auth_token(token)
        if not result['valid']:
            return jsonify({'success': False, 'error': result.get('error', 'Token验证失败')}), 401
        
        # 将用户信息附加到请求上下文
        request.current_user = {
            'user_id': result['user_id'],
            'username': result['username']
        }
        
        return f(*args, **kwargs)
    
    return decorated_function

# ========== 视频处理函数 ==========

def convert_video_to_standard_format(input_video_path, output_video_path=None):
    """
    将视频转换为标准格式（MP4 H.264），便于AI处理
    注意：转换后的视频是临时文件，仅用于骨骼提取，提取完成后应删除
    
    Args:
        input_video_path: 输入视频文件路径（原始文件，会保留）
        output_video_path: 输出视频文件路径（如果为None，则自动生成临时文件）
        
    Returns:
        转换后的视频文件路径，失败返回None（如果输入文件已经是mp4，可能返回原文件路径）
    """
    import subprocess
    
    try:
        # 检查输入文件是否存在
        if not os.path.exists(input_video_path):
            print(f"[格式转换] 错误：输入文件不存在: {input_video_path}")
            return None
        
        # 检查文件扩展名，如果已经是mp4且可能是标准格式，先检查是否需要转换
        input_ext = os.path.splitext(input_video_path)[1].lower()
        
        # 如果输出路径未指定，自动生成临时文件路径
        if output_video_path is None:
            video_dir = os.path.dirname(input_video_path)
            video_basename = os.path.basename(input_video_path)
            video_name_without_ext = os.path.splitext(video_basename)[0]
            # 使用临时文件名，明确标识这是临时文件
            output_video_path = os.path.join(video_dir, f"{video_name_without_ext}_temp_for_pose_extraction.mp4")
        
        # 如果输出文件已存在，先删除
        if os.path.exists(output_video_path):
            os.remove(output_video_path)
        
        print(f"[格式转换] 开始转换视频: {input_video_path} -> {output_video_path}")
        
        # 检查ffmpeg是否可用
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5, check=True)
        except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
            print(f"[格式转换] 警告：ffmpeg不可用，尝试使用原始文件")
            # 如果ffmpeg不可用，且输入文件已经是mp4，直接返回原文件路径
            if input_ext == '.mp4':
                print(f"[格式转换] 输入文件已是mp4格式，跳过转换")
                return input_video_path
            else:
                print(f"[格式转换] 错误：ffmpeg不可用且输入文件不是mp4格式")
                return None
        
        # 获取原始视频的帧率（重要：保持原始帧率，避免播放速度异常）
        try:
            original_fps = get_video_fps(input_video_path)
            print(f"[格式转换] 原始视频帧率: {original_fps} FPS")
        except Exception as fps_error:
            print(f"[格式转换] 警告：无法获取原始帧率: {fps_error}，使用默认值30 FPS")
            original_fps = 30.0
        
        # 使用ffmpeg转换为标准MP4 H.264格式
        # 参数说明：
        # -y: 覆盖输出文件
        # -i: 输入文件
        # -c:v libx264: 使用H.264视频编码
        # -r: 保持原始帧率（关键！避免播放速度异常）
        # -preset fast: 快速编码（平衡速度和质量）
        # -crf 23: 质量参数（18-28，值越小质量越高，23是默认值）
        # -pix_fmt yuv420p: 像素格式（浏览器兼容）
        # -c:a aac: 音频编码为AAC（如果存在音频）
        # -b:a 128k: 音频比特率
        # -movflags +faststart: 优化流媒体播放（将元数据移到文件开头）
        # -avoid_negative_ts make_zero: 处理时间戳问题
        cmd = [
            'ffmpeg', '-y',
            '-i', input_video_path,
            '-c:v', 'libx264',
            '-r', str(original_fps),  # 保持原始帧率（关键！）
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            output_video_path
        ]
        
        print(f"[格式转换] 执行命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)  # 10分钟超时
        
        if result.returncode != 0:
            print(f"[格式转换] 错误：ffmpeg转换失败")
            print(f"[格式转换] stderr: {result.stderr}")
            # 如果转换失败，且输入文件已经是mp4，返回原文件路径
            if input_ext == '.mp4':
                print(f"[格式转换] 转换失败，但输入文件已是mp4格式，使用原文件")
                return input_video_path
            return None
        
        # 验证输出文件
        if not os.path.exists(output_video_path):
            print(f"[格式转换] 错误：输出文件未生成: {output_video_path}")
            if input_ext == '.mp4':
                return input_video_path
            return None
        
        output_size = os.path.getsize(output_video_path)
        if output_size == 0:
            print(f"[格式转换] 错误：输出文件为空")
            os.remove(output_video_path)
            if input_ext == '.mp4':
                return input_video_path
            return None
        
        # 验证视频文件是否可以正常打开
        cap = cv2.VideoCapture(output_video_path)
        if not cap.isOpened():
            print(f"[格式转换] 警告：转换后的视频无法用OpenCV打开")
            cap.release()
            if input_ext == '.mp4':
                return input_video_path
            return None
        
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            print(f"[格式转换] 警告：转换后的视频无法读取帧")
            if input_ext == '.mp4':
                return input_video_path
            return None
        
        print(f"[格式转换] 转换成功: {output_video_path} (大小: {output_size} 字节)")
        print(f"[格式转换] 注意：转换后的文件是临时文件，仅用于骨骼提取，提取完成后应删除")
        
        # 原始文件保留，用于播放
        return output_video_path
        
    except subprocess.TimeoutExpired:
        print(f"[格式转换] 错误：转换超时")
        # 如果转换超时，且输入文件已经是mp4，返回原文件路径
        input_ext = os.path.splitext(input_video_path)[1].lower()
        if input_ext == '.mp4':
            return input_video_path
        return None
    except Exception as e:
        print(f"[格式转换] 错误：转换失败: {str(e)}")
        traceback.print_exc()
        # 如果转换失败，且输入文件已经是mp4，返回原文件路径
        input_ext = os.path.splitext(input_video_path)[1].lower()
        if input_ext == '.mp4':
            return input_video_path
        return None

def generate_video_thumbnail(video_path, thumbnail_folder='thumbnails'):
    """
    生成视频缩略图（提取第1秒的帧）
    
    Args:
        video_path: 视频文件路径
        thumbnail_folder: 缩略图保存文件夹
        
    Returns:
        缩略图文件路径，失败返回 None
    """
    try:
        # 确保缩略图文件夹存在
        if not os.path.exists(thumbnail_folder):
            os.makedirs(thumbnail_folder)
        
        # 打开视频
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"无法打开视频: {video_path}")
            return None
        
        # 获取视频信息
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # 尝试提取第1秒的帧，如果视频太短则提取中间帧
        target_frame = min(int(fps), total_frames // 2) if fps > 0 else 0
        
        # 跳到目标帧
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        
        # 读取帧
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            print(f"无法读取视频帧: {video_path}")
            return None
        
        # 生成缩略图文件名（使用视频文件名 + _thumb.jpg）
        video_basename = os.path.basename(video_path)
        video_name_without_ext = os.path.splitext(video_basename)[0]
        thumbnail_filename = f"{video_name_without_ext}_thumb.jpg"
        thumbnail_path = os.path.join(thumbnail_folder, thumbnail_filename)
        
        # 调整图片大小（可选，节省空间和带宽）
        # 保持宽高比，宽度最大 640px
        height, width = frame.shape[:2]
        max_width = 640
        if width > max_width:
            scale = max_width / width
            new_width = max_width
            new_height = int(height * scale)
            frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
        
        # 保存缩略图
        cv2.imwrite(thumbnail_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(f"缩略图生成成功: {thumbnail_path}")
        
        return thumbnail_path
        
    except Exception as e:
        print(f"生成缩略图失败: {str(e)}")
        traceback.print_exc()
        return None

def async_extract_poses_and_generate_video(task_id, video_id, original_filepath, video_type='reference'):
    """异步提取骨骼数据并生成标记骨骼视频"""
    converted_video_path = None  # 转换后的临时文件路径
    try:
        print(f"[任务 {task_id}] 开始处理视频 {video_id}")
        
        # 更新任务状态为处理中
        db.update_task_status(task_id, 'processing', progress=10)
        
        # 转换为标准格式（临时文件，仅用于骨骼提取）
        print(f"[任务 {task_id}] 转换视频格式用于骨骼提取...")
        converted_video_path = convert_video_to_standard_format(original_filepath)
        if converted_video_path is None:
            print(f"[任务 {task_id}] 警告：格式转换失败，使用原始文件")
            converted_video_path = original_filepath
        elif converted_video_path != original_filepath:
            print(f"[任务 {task_id}] 格式转换成功: {converted_video_path}")
        
        # 提取骨骼数据（使用转换后的临时视频）
        print(f"[任务 {task_id}] 正在提取骨骼数据...")
        poses_data = extract_poses_from_video(converted_video_path, n=5)
        
        db.update_task_status(task_id, 'processing', progress=50)
        print(f"[任务 {task_id}] 提取到 {len(poses_data)} 帧骨骼数据")
        
        # 批量保存骨骼数据到数据库（性能优化）
        print(f"[任务 {task_id}] 正在保存骨骼数据到数据库...")
        db.update_task_status(task_id, 'processing', progress=55)
        
        # 使用批量保存方法，一次性保存所有数据
        db.save_pose_data_batch(video_id, video_type, poses_data)
        
        # 更新姿势数据状态
        db.update_pose_extraction_status(video_id, True, video_type)
        
        db.update_task_status(task_id, 'processing', progress=65)
        print(f"[任务 {task_id}] 骨骼数据已保存到数据库")
        
        # 只为参考视频生成标记骨骼视频
        if video_type == 'reference':
            print(f"[任务 {task_id}] 正在生成标记骨骼视频...")
            db.update_task_status(task_id, 'processing', progress=70)
            
            output_dir = os.path.join(TEMP_FOLDER, f"ref_{video_id}")
            os.makedirs(output_dir, exist_ok=True)
            pose_video_path = os.path.join(output_dir, "pose_video.mp4")
            
            # 生成标记骨骼视频（使用转换后的临时视频，如果转换失败则使用原始视频）
            generate_pose_video(converted_video_path, pose_video_path, n=5)
            
            db.update_task_status(task_id, 'processing', progress=90)
            
            # 更新标记骨骼视频路径
            db.update_pose_video_path(video_id, pose_video_path)
            print(f"[任务 {task_id}] 标记骨骼视频生成完成")
        else:
            # 用户视频不生成标记骨骼视频，直接跳到90%
            db.update_task_status(task_id, 'processing', progress=90)
        
        # 任务完成
        db.update_task_status(task_id, 'completed', progress=100)
        print(f"[任务 {task_id}] 处理完成")
        
    except Exception as e:
        error_msg = f"处理失败: {str(e)}\n{traceback.format_exc()}"
        print(f"[任务 {task_id}] {error_msg}")
        db.update_task_status(task_id, 'failed', error_message=error_msg)
    finally:
        # 确保删除转换后的临时文件（如果存在且不是原始文件）
        if converted_video_path and converted_video_path != original_filepath and os.path.exists(converted_video_path):
            try:
                os.remove(converted_video_path)
                print(f"[任务 {task_id}] 已删除临时转换文件: {converted_video_path}")
            except Exception as delete_error:
                print(f"[任务 {task_id}] 警告：删除临时转换文件失败: {delete_error}")



def get_video_duration(video_file):
    """获取视频时长（秒）- 优先使用 ffprobe，回退到 OpenCV"""
    import subprocess
    import json
    
    # 首先尝试使用 ffprobe（对 webm 格式更可靠）
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            video_file
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            duration = float(data.get('format', {}).get('duration', 0))
            if duration > 0:
                print(f"使用 ffprobe 获取视频时长: {duration:.2f}秒")
                return duration
    except (FileNotFoundError, json.JSONDecodeError, ValueError, subprocess.TimeoutExpired) as e:
        print(f"ffprobe 获取时长失败，使用 OpenCV: {e}")
    
    # 回退到 OpenCV 方法
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        raise ValueError("无法打开视频文件")
    
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # 如果 OpenCV 无法获取有效信息，尝试通过实际读取帧来计算
        if fps <= 0 or frame_count <= 0 or frame_count > 100000000:
            print(f"警告：OpenCV 无法获取有效信息 (fps={fps}, frames={frame_count})，尝试实际读取")
            # 通过实际读取帧来计算时长
            frame_count = 0
            while True:
                ret, _ = cap.read()
                if not ret:
                    break
                frame_count += 1
            
            # 重新打开视频获取 fps
            cap.release()
            cap = cv2.VideoCapture(video_file)
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0:
                fps = 30.0  # 默认帧率
        
        if frame_count <= 0:
            cap.release()
            raise ValueError("无法获取视频帧数")
        
        duration = frame_count / fps
        print(f"使用 OpenCV 获取视频时长: {duration:.2f}秒 (frames={frame_count}, fps={fps})")
        return duration
    finally:
        cap.release()

def get_video_fps(video_file):
    """获取视频帧率 - 优先使用 ffprobe，回退到 OpenCV"""
    import subprocess
    import json
    
    # 首先尝试使用 ffprobe（对 webm 格式更可靠）
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate',
            '-of', 'json',
            video_file
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            streams = data.get('streams', [])
            if streams:
                frame_rate_str = streams[0].get('r_frame_rate', '')
                if frame_rate_str and '/' in frame_rate_str:
                    num, den = map(int, frame_rate_str.split('/'))
                    if den > 0:
                        fps = num / den
                        print(f"使用 ffprobe 获取视频帧率: {fps:.2f} FPS")
                        return fps
    except (FileNotFoundError, json.JSONDecodeError, ValueError, subprocess.TimeoutExpired, IndexError, ZeroDivisionError, KeyError) as e:
        print(f"ffprobe 获取帧率失败，使用 OpenCV: {e}")
    
    # 回退到 OpenCV 方法
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        raise ValueError("无法打开视频文件")
    
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 30.0  # 默认帧率
        print(f"使用 OpenCV 获取视频帧率: {fps:.2f} FPS")
        return fps
    finally:
        cap.release()

def extract_poses_from_video(video_file, n=5, early_stop_threshold=50):
    """
    从视频中提取姿势数据并返回字典（等距提取，包含无骨骼数据的帧）
    
    Args:
        video_file: 视频文件路径
        n: 每隔n帧提取一次
        early_stop_threshold: 如果连续N帧都没有检测到人像，提前终止（0表示不提前终止）
    
    Returns:
        dict: 帧索引到骨骼数据的映射，无骨骼时存储None
    """
    # 优化后的关键点位 - 只保留舞蹈动作分析最核心的点位
    selected_landmarks = [
        0,  # 鼻子 - 头部位置
        11,  # 左肩 - 上半身姿态
        12,  # 右肩 - 上半身姿态
        13,  # 左肘 - 手臂动作
        14,  # 右肘 - 手臂动作
        15,  # 左手腕 - 手部位置
        16,  # 右手腕 - 手部位置
        23,  # 左髋 - 下半身姿态
        24,  # 右髋 - 下半身姿态
        25,  # 左膝 - 腿部动作
        26,  # 右膝 - 腿部动作
        27,  # 左脚踝 - 脚部位置
        28  # 右脚踝 - 脚部位置
    ]

    mp_pose = mp.solutions.pose
    cap = cv2.VideoCapture(video_file)
    frame_idx = 0
    poses_data = {}
    consecutive_no_pose = 0  # 连续未检测到人像的帧数

    with mp_pose.Pose(static_image_mode=False) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % n == 0:
                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(image_rgb)
                if results.pose_landmarks:
                    # 提取选定的骨骼点坐标
                    pose_data = []
                    for i, lm in enumerate(results.pose_landmarks.landmark):
                        if i in selected_landmarks:
                            pose_data.append([lm.x, lm.y, lm.z, lm.visibility])
                    poses_data[frame_idx] = pose_data
                    consecutive_no_pose = 0  # 重置计数器
                else:
                    # 没有检测到骨骼数据，存储None作为标记
                    poses_data[frame_idx] = None
                    consecutive_no_pose += 1
                    
                    # 提前终止检查：如果连续多帧没有检测到人像
                    if early_stop_threshold > 0 and consecutive_no_pose >= early_stop_threshold:
                        print(f"[提取骨骼] 连续 {consecutive_no_pose} 帧未检测到人像，提前终止提取")
                        break
            frame_idx += 1
    cap.release()
    
    # 打印提取统计信息
    valid_poses = sum(1 for pose in poses_data.values() if pose is not None)
    print(f"[提取骨骼] 共处理 {len(poses_data)} 帧，有效骨骼数据 {valid_poses} 帧")
    
    return poses_data

def generate_pose_video(video_file, output_file, n=5):
    """生成标记骨骼的视频（带音频）"""
    import subprocess
    
    # 使用相同的13个关键点
    selected_landmarks = [
        0,  # 鼻子 - 头部位置
        11,  # 左肩 - 上半身姿态
        12,  # 右肩 - 上半身姿态
        13,  # 左肘 - 手臂动作
        14,  # 右肘 - 手臂动作
        15,  # 左手腕 - 手部位置
        16,  # 右手腕 - 手部位置
        23,  # 左髋 - 下半身姿态
        24,  # 右髋 - 下半身姿态
        25,  # 左膝 - 腿部动作
        26,  # 右膝 - 腿部动作
        27,  # 左脚踝 - 脚部位置
        28  # 右脚踝 - 脚部位置
    ]
    
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        raise Exception(f"无法打开视频文件: {video_file}")
    
    try:
        # 优先使用 get_video_fps 函数（使用 ffprobe，更准确）
        # 这对于某些格式（如 webm）的原始视频特别重要
        try:
            fps = get_video_fps(video_file)
            print(f"[生成骨骼视频] 使用 get_video_fps 获取帧率: {fps:.2f} FPS")
        except Exception as fps_error:
            print(f"[生成骨骼视频] get_video_fps 失败，使用 OpenCV: {fps_error}")
            # 回退到 OpenCV 方法
            fps = cap.get(cv2.CAP_PROP_FPS)
            import math
            if math.isnan(fps) or fps <= 0:
                fps = 30.0  # 默认帧率
                print(f"[生成骨骼视频] OpenCV 无法获取帧率，使用默认值: {fps} FPS")
        
        width_raw = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        height_raw = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        
        # 安全地转换为整数，处理 NaN 和无效值
        import math
        if math.isnan(width_raw) or width_raw <= 0:
            width = 640  # 默认宽度
        else:
            width = int(width_raw)
        if math.isnan(height_raw) or height_raw <= 0:
            height = 480  # 默认高度
        else:
            height = int(height_raw)
        
        # 验证视频参数
        if width <= 0 or height <= 0:
            cap.release()
            raise Exception(f"视频参数无效: fps={fps}, width={width}, height={height}")
    except Exception as e:
        cap.release()
        raise Exception(f"获取视频参数失败: {str(e)}")
    
    # 创建临时视频文件（无音频）
    temp_video = os.path.join(TEMP_FOLDER, f"temp_{uuid.uuid4().hex}_video.mp4")
    
    # 确保临时目录存在
    os.makedirs(TEMP_FOLDER, exist_ok=True)
    
    # 尝试多种编码格式，按兼容性排序
    codecs_to_try = [
        ('mp4v', 'mp4v'),  # MPEG-4 Part 2，最兼容
        ('XVID', 'XVID'),  # Xvid MPEG-4
        ('avc1', 'avc1'),  # H.264 (avc1)
        ('H264', 'H264'),  # H.264 (H264)
    ]
    
    out = None
    used_codec = None
    
    # 尝试创建视频写入器
    for codec_name, fourcc_str in codecs_to_try:
        try:
            fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
            out = cv2.VideoWriter(temp_video, fourcc, fps, (width, height))
            
            # 检查是否成功初始化
            if out.isOpened():
                used_codec = codec_name
                print(f"成功使用 {codec_name} 编码器创建视频写入器")
                break
            else:
                out.release()
                out = None
                print(f"警告: {codec_name} 编码器初始化失败")
        except Exception as e:
            print(f"警告: 尝试使用 {codec_name} 编码器时出错: {e}")
            if out:
                out.release()
                out = None
    
    # 如果所有编码器都失败，尝试使用 ffmpeg 转换格式
    if out is None or not out.isOpened():
        print("警告: 所有 OpenCV 编码器都失败，尝试使用 ffmpeg 转换视频格式")
        try:
            # 检查 ffmpeg 是否可用
            subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5, check=True)
            
            # 使用 ffmpeg 将原视频转换为 mp4 格式（无骨骼标记，但至少格式正确）
            cmd = [
                'ffmpeg', '-y',
                '-i', video_file,
                '-c:v', 'libx264',  # 使用 H.264 编码
                '-preset', 'fast',  # 快速编码
                '-crf', '23',  # 质量参数
                '-c:a', 'aac',  # 音频编码
                '-movflags', '+faststart',  # 优化流媒体播放
                output_file
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0:
                print("警告: 使用 ffmpeg 转换视频格式成功（无骨骼标记）")
                return output_file
            else:
                print(f"FFmpeg转换失败: {result.stderr}")
                # 如果 ffmpeg 转换失败，不能直接复制原视频（可能是 webm 格式）
                # 因为输出文件名是 .mp4，但内容可能是 webm，会导致浏览器无法播放
                raise Exception(f"FFmpeg转换失败，无法生成视频文件: {result.stderr}")
        except FileNotFoundError:
            print("警告: FFmpeg未找到，无法转换视频格式")
            # 如果 ffmpeg 不可用，不能直接复制原视频（可能是 webm 格式）
            # 因为输出文件名是 .mp4，但内容可能是 webm，会导致浏览器无法播放
            # 所以这里应该抛出异常，提示需要安装 ffmpeg
            raise Exception("FFmpeg未安装，无法生成视频文件。请安装 ffmpeg 或使用 Docker 环境。")
        except subprocess.TimeoutExpired:
            print("警告: FFmpeg检查超时，无法转换视频格式")
            raise Exception("FFmpeg检查超时，无法生成视频文件")
        except Exception as e:
            print(f"警告: 视频转换失败: {e}")
            # 不能直接复制原视频（可能是 webm 格式），因为输出文件名是 .mp4
            raise Exception(f"无法生成视频文件: {str(e)}")
    
    frame_idx = 0
    
    with mp_pose.Pose(static_image_mode=False) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # 只在指定间隔的帧上绘制骨骼
            if frame_idx % n == 0:
                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(image_rgb)
                
                if results.pose_landmarks:
                    # 创建只包含选定关键点的landmarks对象
                    filtered_landmarks = []
                    for i, landmark in enumerate(results.pose_landmarks.landmark):
                        if i in selected_landmarks:
                            filtered_landmarks.append(landmark)
                        else:
                            # 对于不在选定列表中的点，创建不可见的点
                            invisible_landmark = type(landmark)()
                            invisible_landmark.x = 0
                            invisible_landmark.y = 0
                            invisible_landmark.z = 0
                            invisible_landmark.visibility = 0
                            filtered_landmarks.append(invisible_landmark)
                    
                    # 创建新的pose_landmarks对象
                    filtered_pose_landmarks = type(results.pose_landmarks)()
                    filtered_pose_landmarks.landmark.extend(filtered_landmarks)
                    
                    # 绘制骨骼连线（只显示选定关键点之间的连接）
                    mp_drawing.draw_landmarks(
                        frame, 
                        filtered_pose_landmarks, 
                        mp_pose.POSE_CONNECTIONS,
                        landmark_drawing_spec=mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                        connection_drawing_spec=mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2)
                    )
            
            out.write(frame)
            frame_idx += 1
    
    cap.release()
    out.release()
    
    # 检查临时文件是否成功创建
    if not os.path.exists(temp_video):
        print(f"错误: 临时视频文件未创建: {temp_video}")
        raise Exception(f"无法创建临时视频文件，使用的编码器: {used_codec}")
    
    # 使用ffmpeg合并视频和音频，并确保使用浏览器兼容的格式
    try:
        # 确保临时文件存在
        if not os.path.exists(temp_video):
            raise Exception(f"临时视频文件不存在: {temp_video}")
        
        # 检查临时视频文件大小
        temp_size = os.path.getsize(temp_video)
        if temp_size == 0:
            raise Exception(f"临时视频文件为空: {temp_video}")
        
        # 使用 ffmpeg 重新编码为浏览器兼容的 H.264 格式
        # 重要：必须保持原始帧率，否则会导致播放速度异常
        cmd = [
            'ffmpeg', '-y',  # -y 覆盖输出文件
            '-i', temp_video,  # 输入视频（无音频）
            '-i', video_file,  # 输入原视频（有音频）
            '-c:v', 'libx264',  # 使用 H.264 编码（浏览器兼容）
            '-r', str(fps),  # 保持原始帧率（关键！）
            '-preset', 'fast',  # 快速编码
            '-crf', '23',  # 质量参数
            '-pix_fmt', 'yuv420p',  # 像素格式（浏览器兼容）
            '-c:a', 'aac',  # 音频编码为AAC
            '-b:a', '128k',  # 音频比特率
            '-map', '0:v:0',  # 使用第一个输入的视频流
            '-map', '1:a:0?',  # 使用第二个输入的音频流（如果存在）
            '-shortest',  # 以较短的流为准
            '-movflags', '+faststart',  # 优化流媒体播放
            output_file
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"FFmpeg错误: {result.stderr}")
            # 如果合并失败，尝试只重新编码视频（无音频）
            print("尝试重新编码视频（无音频）...")
            cmd_no_audio = [
                'ffmpeg', '-y',
                '-i', temp_video,
                '-c:v', 'libx264',
                '-r', str(fps),  # 保持原始帧率（关键！）
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                output_file
            ]
            result_no_audio = subprocess.run(cmd_no_audio, capture_output=True, text=True, timeout=300)
            if result_no_audio.returncode != 0:
                print(f"FFmpeg重新编码失败: {result_no_audio.stderr}")
                # 如果重新编码也失败，使用原始临时文件（可能不兼容）
                if os.path.exists(temp_video):
                    shutil.copy2(temp_video, output_file)
                    print("警告: 使用原始临时文件（可能不兼容）")
                else:
                    raise Exception(f"临时视频文件不存在且ffmpeg失败: {temp_video}")
            else:
                print("成功重新编码视频（无音频）")
        else:
            print("成功添加音频到生成的视频")
    except FileNotFoundError:
        print("FFmpeg未找到，生成无音频版本")
        # 如果ffmpeg不可用，使用无音频版本
        if os.path.exists(temp_video):
            shutil.copy2(temp_video, output_file)
        else:
            raise Exception(f"临时视频文件不存在且ffmpeg未安装: {temp_video}")
    except subprocess.TimeoutExpired:
        print("FFmpeg处理超时，使用无音频版本")
        if os.path.exists(temp_video):
            shutil.copy2(temp_video, output_file)
        else:
            raise Exception(f"临时视频文件不存在且ffmpeg超时: {temp_video}")
    except Exception as e:
        print(f"音频处理失败: {e}")
        # 如果出现其他错误，使用无音频版本
        if os.path.exists(temp_video):
            shutil.copy2(temp_video, output_file)
            print("使用无音频版本（处理失败）")
        else:
            raise Exception(f"临时视频文件不存在: {temp_video}, 错误: {str(e)}")
    finally:
        # 清理临时文件
        if os.path.exists(temp_video):
            try:
                os.remove(temp_video)
            except Exception as e:
                print(f"警告: 清理临时文件失败: {e}")
    
    # 验证生成的视频文件是否有效
    if not os.path.exists(output_file):
        raise Exception(f"生成的视频文件不存在: {output_file}")
    
    file_size = os.path.getsize(output_file)
    if file_size == 0:
        raise Exception(f"生成的视频文件为空: {output_file}")
    
    # 使用 OpenCV 验证视频文件是否可以正常打开和读取
    try:
        cap = cv2.VideoCapture(output_file)
        if not cap.isOpened():
            raise Exception(f"无法打开生成的视频文件: {output_file}")
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            raise Exception(f"生成的视频文件无法读取帧: {output_file}")
        
        print(f"视频文件验证成功: {output_file}, 大小: {file_size} 字节")
    except Exception as validation_error:
        # 如果验证失败，尝试使用 ffprobe 验证
        try:
            import subprocess
            cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name', '-of', 'json', output_file]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                raise Exception(f"ffprobe 验证失败: {result.stderr}")
            print(f"使用 ffprobe 验证成功: {output_file}")
        except FileNotFoundError:
            # 如果 ffprobe 不可用，但 OpenCV 验证失败，仍然抛出错误
            raise validation_error
        except Exception as ffprobe_error:
            # 如果两种验证都失败，抛出错误
            raise Exception(f"视频文件验证失败: {str(validation_error)}, ffprobe: {str(ffprobe_error)}")
    
    return output_file

def get_video_frames_with_poses(video_file, n=5):
    """获取视频的每一帧及其骨骼数据"""
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils
    
    cap = cv2.VideoCapture(video_file)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames_data = []
    frame_idx = 0
    
    with mp_pose.Pose(static_image_mode=False) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # 处理每一帧
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image_rgb)
            
            frame_data = {
                'frame_index': frame_idx,
                'timestamp': frame_idx / fps,
                'has_pose': results.pose_landmarks is not None,
                'pose_landmarks': None
            }
            
            if results.pose_landmarks:
                # 提取关键点坐标
                landmarks = []
                for lm in results.pose_landmarks.landmark:
                    landmarks.append({
                        'x': lm.x,
                        'y': lm.y,
                        'z': lm.z,
                        'visibility': lm.visibility
                    })
                frame_data['pose_landmarks'] = landmarks
                
                # 绘制骨骼到帧上
                mp_drawing.draw_landmarks(
                    frame, 
                    results.pose_landmarks, 
                    mp_pose.POSE_CONNECTIONS,
                    landmark_drawing_spec=mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    connection_drawing_spec=mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2)
                )
            
            # 编码帧为base64
            _, buffer = cv2.imencode('.jpg', frame)
            frame_data['frame_image'] = buffer.tobytes()
            
            frames_data.append(frame_data)
            frame_idx += 1
    
    cap.release()
    return frames_data

def calculate_pose_difference(pose1, pose2):
    """计算两个姿势数据之间的差异（处理None值）"""
    # 如果任一姿势数据为None，返回特殊值表示无法比较
    if pose1 is None or pose2 is None:
        return -1  # 使用-1表示无骨骼数据
    
    if len(pose1) != len(pose2):
        # 返回一个很大的数字而不是 Infinity，以便 JSON 序列化
        return 999999.0

    total_diff = 0
    valid_points = 0

    for i in range(len(pose1)):
        # 提高可见性阈值，确保只比较高质量的关键点
        if pose1[i][3] > 0.7 and pose2[i][3] > 0.7:
            # 计算3D距离
            diff = np.sqrt(
                (pose1[i][0] - pose2[i][0]) ** 2 +
                (pose1[i][1] - pose2[i][1]) ** 2 +
                (pose1[i][2] - pose2[i][2]) ** 2
            )
            total_diff += diff
            valid_points += 1

    # 如果有效点太少，认为骨骼提取质量差
    if valid_points < len(pose1) * 0.6:  # 至少需要60%的关键点可见
        # 返回一个很大的数字而不是 Infinity，以便 JSON 序列化
        return 999999.0

    if valid_points == 0:
        # 返回一个很大的数字而不是 Infinity，以便 JSON 序列化
        return 999999.0

    return total_diff / valid_points

def compare_poses(reference_poses, recorded_poses, threshold=0.2):
    """比较两个视频的姿势，找出差异较大的帧"""
    differences = []

    # 获取两个视频的帧索引
    ref_frames = sorted(reference_poses.keys())
    rec_frames = sorted(recorded_poses.keys())

    # 计算最小帧数
    min_frames = min(len(ref_frames), len(rec_frames))

    for i in range(min_frames):
        ref_frame_idx = ref_frames[i]
        rec_frame_idx = rec_frames[i]

        ref_pose = reference_poses[ref_frame_idx]
        rec_pose = recorded_poses[rec_frame_idx]

        # 计算姿势差异
        pose_diff = calculate_pose_difference(ref_pose, rec_pose)

        if pose_diff > threshold:
            differences.append({
                'frame_idx': rec_frame_idx,
                'reference_frame': ref_frame_idx,
                'difference': pose_diff,
                'timestamp': rec_frame_idx * 0.2  # 假设5帧间隔，每帧0.2秒
            })

    return differences

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'message': 'Dance pose comparison service is running'
    })

# ========== 认证相关接口 ==========

@app.route('/api/auth/register', methods=['POST'])
def register():
    """用户注册"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        email = data.get('email', '').strip()
        
        # 验证输入
        if not username or not password:
            return jsonify({
                'success': False,
                'error': '用户名和密码不能为空'
            }), 400
        
        if len(username) < 3:
            return jsonify({
                'success': False,
                'error': '用户名长度至少3个字符'
            }), 400
        
        if len(password) < 6:
            return jsonify({
                'success': False,
                'error': '密码长度至少6个字符'
            }), 400
        
        # 检查用户名是否已存在
        existing_user = db.get_user_by_username(username)
        if existing_user:
            return jsonify({
                'success': False,
                'error': '用户名已存在'
            }), 400
        
        # 创建用户
        password_hash = generate_password_hash(password)
        if not db.create_user(username, password_hash, email):
            return jsonify({
                'success': False,
                'error': '注册失败，请稍后重试'
            }), 500
        
        # 获取新创建的用户信息
        user = db.get_user_by_username(username)
        
        # 生成Token
        token = generate_auth_token(user['id'], user['username'])
        
        # 保存会话
        expires_at = (datetime.utcnow() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()
        db.save_session(user['id'], token, expires_at)
        
        # 更新最后登录时间
        db.update_last_login(user['id'])
        
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user.get('email', ''),
                'created_at': user['created_at']
            },
            'message': '注册成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """用户登录"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        # 验证输入
        if not username or not password:
            return jsonify({
                'success': False,
                'error': '用户名和密码不能为空'
            }), 400
        
        # 查找用户
        user = db.get_user_by_username(username)
        if not user:
            return jsonify({
                'success': False,
                'error': '用户名或密码错误'
            }), 401
        
        # 验证密码
        if not check_password_hash(user['password_hash'], password):
            return jsonify({
                'success': False,
                'error': '用户名或密码错误'
            }), 401
        
        # 生成Token
        token = generate_auth_token(user['id'], user['username'])
        
        # 保存会话
        expires_at = (datetime.utcnow() + timedelta(days=TOKEN_EXPIRY_DAYS)).isoformat()
        db.save_session(user['id'], token, expires_at)
        
        # 更新最后登录时间
        db.update_last_login(user['id'])
        
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user.get('email', ''),
                'avatar_url': user.get('avatar_url', ''),
                'created_at': user['created_at'],
                'last_login': user['last_login']
            },
            'message': '登录成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    """用户注销"""
    try:
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '')
        
        # 删除会话
        db.delete_session(token)
        
        return jsonify({
            'success': True,
            'message': '注销成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/current-user', methods=['GET'])
@require_auth
def get_current_user():
    """获取当前登录用户信息"""
    try:
        user = db.get_user_by_id(request.current_user['user_id'])
        if not user:
            return jsonify({
                'success': False,
                'error': '用户不存在'
            }), 404
        
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user.get('email', ''),
                'avatar_url': user.get('avatar_url', ''),
                'created_at': user['created_at'],
                'last_login': user['last_login']
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ========== 视频相关接口 ==========


@app.route('/api/upload-user-video', methods=['POST'])
@require_auth
def upload_user_video():
    """上传用户视频并提取骨骼数据（临时缓存）- 需要登录"""
    try:
        print(f"[上传用户视频] 收到请求")
        
        # 检查是否有用户视频上传
        if 'user_video' not in request.files:
            print(f"[上传用户视频] 错误：缺少用户视频文件")
            return jsonify({
                'success': False,
                'error': '缺少用户视频文件'
            }), 400

        user_file = request.files['user_video']

        # 检查文件名
        if user_file.filename == '':
            print(f"[上传用户视频] 错误：未选择用户视频文件")
            return jsonify({
                'success': False,
                'error': '未选择用户视频文件'
            }), 400

        # 检查文件类型
        if not allowed_file(user_file.filename):
            print(f"[上传用户视频] 错误：不支持的文件格式 {user_file.filename}")
            return jsonify({
                'success': False,
                'error': '不支持的用户视频文件格式'
            }), 400

        # 获取参考视频ID
        reference_video_id = request.form.get('reference_video_id')
        print(f"[上传用户视频] 参考视频ID: {reference_video_id}")
        
        if not reference_video_id:
            print(f"[上传用户视频] 错误：缺少参考视频ID")
            return jsonify({
                'success': False,
                'error': '缺少参考视频ID'
            }), 400

        # 验证参考视频是否存在
        reference_video = db.get_video_by_id(reference_video_id, 'reference')
        if not reference_video:
            print(f"[上传用户视频] 错误：参考视频 {reference_video_id} 不存在")
            return jsonify({
                'success': False,
                'error': f'指定的参考视频 {reference_video_id} 不存在'
            }), 400

        # 生成唯一的用户视频ID
        user_video_id = str(uuid.uuid4())
        
        # 创建临时工作目录
        work_dir = os.path.join(TEMP_FOLDER, f"user_{user_video_id}")
        os.makedirs(work_dir, exist_ok=True)

        try:
            # 保存用户上传的文件（原始文件，用于播放）
            original_user_path = os.path.join(work_dir, secure_filename(user_file.filename))
            user_file.save(original_user_path)

            # 获取用户视频信息（使用原始视频）
            try:
                user_duration = get_video_duration(original_user_path)
                user_fps = get_video_fps(original_user_path)
            except Exception as video_info_error:
                print(f"[上传用户视频] 警告：无法获取视频信息: {video_info_error}")
                # 设置默认值
                user_duration = 0
                user_fps = 30.0
            
            # 处理异常的duration值（webm格式可能返回极大的负数）
            if user_duration < 0 or user_duration > 86400:  # 超过24小时视为异常
                print(f"[上传用户视频] 警告：检测到异常的duration值 {user_duration}，重置为0")
                user_duration = 0

            # 保存用户视频信息到数据库（保存原始视频路径，用于播放）
            db_result = db.add_user_video(user_video_id, user_file.filename, original_user_path, user_duration, user_fps)
            
            if not db_result:
                print(f"[上传用户视频] 错误：数据库插入失败")
                return jsonify({
                    'success': False,
                    'error': '保存视频信息到数据库失败'
                }), 500

            # 立即返回响应，骨骼提取在后台异步进行
            print(f"用户视频 {user_video_id} 上传成功，准备异步提取骨骼数据...")
            
            # 启动后台线程提取骨骼数据
            import threading
            def extract_poses_async():
                extraction_error = None
                converted_video_path = None  # 转换后的临时文件路径
                try:
                    print(f"[后台任务] 开始提取用户视频 {user_video_id} 的骨骼数据...")
                    
                    # 更新进度：开始处理
                    db.update_pose_extraction_progress(user_video_id, 10)
                    
                    # 转换为标准格式（临时文件，仅用于骨骼提取）
                    print(f"[后台任务] 转换视频格式用于骨骼提取...")
                    converted_video_path = convert_video_to_standard_format(original_user_path)
                    if converted_video_path is None:
                        print(f"[后台任务] 警告：格式转换失败，使用原始文件")
                        converted_video_path = original_user_path
                    elif converted_video_path != original_user_path:
                        print(f"[后台任务] 格式转换成功: {converted_video_path}")
                    
                    # 提取骨骼数据（使用转换后的临时视频）
                    user_poses = extract_poses_from_video(converted_video_path, n=5, early_stop_threshold=50)
                    
                    # 更新进度：提取完成
                    db.update_pose_extraction_progress(user_video_id, 60)
                    
                    # 检查是否提取到有效的骨骼数据
                    valid_poses = sum(1 for pose in user_poses.values() if pose is not None)
                    total_frames = len(user_poses)
                    
                    print(f"[后台任务] 提取结果：total_frames={total_frames}, valid_poses={valid_poses}")
                    
                    if total_frames == 0:
                        extraction_error = "视频处理失败：无法读取视频帧"
                        print(f"[后台任务] 错误：{extraction_error}")
                    elif valid_poses == 0:
                        extraction_error = "视频中未检测到任何人像骨骼数据，请确保视频中有清晰的人物动作"
                        print(f"[后台任务] 警告：{extraction_error}")
                    else:
                        print(f"[后台任务] 提取到 {valid_poses}/{total_frames} 帧有效骨骼数据")
                    
                    # 更新进度：保存数据
                    db.update_pose_extraction_progress(user_video_id, 80)
                    
                    # 保存用户视频骨骼数据到数据库（使用批量保存优化性能）
                    try:
                        if total_frames > 0:
                            # 使用批量保存方法（跳过None值）
                            save_result = db.save_pose_data_batch(user_video_id, 'user', user_poses)
                            if save_result:
                                print(f"[后台任务] 批量保存骨骼数据成功")
                            else:
                                print(f"[后台任务] 警告：批量保存骨骼数据失败，但继续处理")
                    except Exception as save_error:
                        print(f"[后台任务] 保存数据异常: {save_error}")
                        # 不设置extraction_error，允许继续标记完成
                    
                    # 更新进度：完成
                    db.update_pose_extraction_progress(user_video_id, 100)
                    
                    # 标记骨骼数据已提取（记录错误信息）
                    db.update_pose_extraction_status(user_video_id, True, 'user', extraction_error)
                    
                    if extraction_error:
                        print(f"[后台任务] 用户视频 {user_video_id} 处理完成但有警告: {extraction_error}")
                    else:
                        print(f"[后台任务] 用户视频 {user_video_id} 骨骼数据提取完成")
                    
                    # 删除转换后的临时文件（如果存在且不是原始文件）
                    if converted_video_path and converted_video_path != original_user_path and os.path.exists(converted_video_path):
                        try:
                            os.remove(converted_video_path)
                            print(f"[后台任务] 已删除临时转换文件: {converted_video_path}")
                        except Exception as delete_error:
                            print(f"[后台任务] 警告：删除临时转换文件失败: {delete_error}")
                        
                except Exception as e:
                    extraction_error = f"处理失败: {str(e)}"
                    print(f"[后台任务] 提取骨骼数据失败: {extraction_error}")
                    import traceback
                    traceback.print_exc()
                    
                    # 标记为已提取（失败状态），记录错误信息
                    try:
                        db.update_pose_extraction_status(user_video_id, True, 'user', extraction_error)
                        db.update_pose_extraction_progress(user_video_id, 100)
                        print(f"[后台任务] 已标记视频 {user_video_id} 为提取完成（失败）")
                    except Exception as update_error:
                        print(f"[后台任务] 更新状态失败: {str(update_error)}")
                finally:
                    # 确保删除转换后的临时文件（如果存在且不是原始文件）
                    if 'converted_video_path' in locals() and converted_video_path and converted_video_path != original_user_path and os.path.exists(converted_video_path):
                        try:
                            os.remove(converted_video_path)
                            print(f"[后台任务] 已删除临时转换文件: {converted_video_path}")
                        except Exception as delete_error:
                            print(f"[后台任务] 警告：删除临时转换文件失败: {delete_error}")
            
            thread = threading.Thread(target=extract_poses_async, daemon=True)
            thread.start()

            return jsonify({
                'success': True,
                'user_video_id': user_video_id,
                'filename': user_file.filename,
                'filepath': original_user_path,
                'duration': user_duration,
                'fps': user_fps,
                'pose_data_extracted': False,  # 标记为正在提取中
                'message': '用户视频上传成功，正在后台提取骨骼数据'
            })

        except Exception as e:
            # 如果处理失败，清理已创建的文件
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)
            raise e

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/user-video-status/<video_id>', methods=['GET'])
@require_auth
def get_user_video_status(video_id):
    """查询用户视频骨骼数据提取状态"""
    try:
        video = db.get_video_by_id(video_id, 'user')
        if not video:
            return jsonify({
                'success': False,
                'error': '视频不存在'
            }), 404
        
        return jsonify({
            'success': True,
            'user_video_id': video_id,
            'pose_data_extracted': video.get('pose_data_extracted', False),
            'pose_extraction_error': video.get('pose_extraction_error'),
            'pose_extraction_progress': video.get('pose_extraction_progress', 0),
            'filename': video.get('filename', ''),
            'duration': video.get('duration', 0)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/compare-uploaded-videos', methods=['POST'])
def compare_uploaded_videos():
    """比较已上传的用户视频和参考视频"""
    try:
        user_video_id = request.form.get('user_video_id')
        reference_video_id = request.form.get('reference_video_id')
        threshold = float(request.form.get('threshold', 0.2))

        if not user_video_id or not reference_video_id:
            return jsonify({
                'success': False,
                'error': '缺少用户视频ID或参考视频ID'
            }), 400

        # 获取用户视频信息
        user_video = db.get_video_by_id(user_video_id, 'user')
        if not user_video:
            return jsonify({
                'success': False,
                'error': f'用户视频 {user_video_id} 不存在'
            }), 400

        # 获取参考视频信息
        reference_video = db.get_video_by_id(reference_video_id, 'reference')
        if not reference_video:
            return jsonify({
                'success': False,
                'error': f'参考视频 {reference_video_id} 不存在'
            }), 400

        # 获取骨骼数据
        user_poses = {}
        user_pose_data = db.get_pose_data(user_video_id)
        if user_pose_data:
            for pose_item in user_pose_data:
                user_poses[pose_item['frame_index']] = pose_item['pose_data']
        else:
            # 尝试重新提取骨骼数据
            print(f"用户视频 {user_video_id} 骨骼数据不存在，尝试重新提取...")
            try:
                if os.path.exists(user_video['file_path']):
                    # 重新提取骨骼数据
                    work_dir = os.path.join(TEMP_FOLDER, f"user_{user_video_id}")
                    os.makedirs(work_dir, exist_ok=True)
                    
                    user_poses = extract_poses_from_video(
                        user_video['file_path'], 
                        n=5
                    )
                    
                    # 保存骨骼数据到数据库
                    for frame_idx, pose_data in user_poses.items():
                        db.save_pose_data(user_video_id, 'user', frame_idx, pose_data, frame_idx * 0.2)
                    
                    # 更新骨骼数据状态
                    db.update_pose_extraction_status(user_video_id, True)
                    
                    print(f"用户视频 {user_video_id} 骨骼数据重新提取成功，共 {len(user_poses)} 帧")
                else:
                    return jsonify({
                        'success': False,
                        'error': f'用户视频文件不存在: {user_video["file_path"]}'
                    }), 400
            except Exception as e:
                print(f"重新提取用户视频骨骼数据失败: {e}")
                return jsonify({
                    'success': False,
                    'error': f'用户视频骨骼数据不存在且重新提取失败: {str(e)}'
                }), 400

        reference_poses = {}
        reference_pose_data = db.get_pose_data(reference_video_id)
        if reference_pose_data:
            for pose_item in reference_pose_data:
                reference_poses[pose_item['frame_index']] = pose_item['pose_data']
        else:
            # 尝试重新提取参考视频骨骼数据
            print(f"参考视频 {reference_video_id} 骨骼数据不存在，尝试重新提取...")
            try:
                if os.path.exists(reference_video['file_path']):
                    # 重新提取骨骼数据
                    work_dir = os.path.join(TEMP_FOLDER, f"ref_{reference_video_id}")
                    os.makedirs(work_dir, exist_ok=True)
                    
                    reference_poses = extract_poses_from_video(
                        reference_video['file_path'], 
                        n=5
                    )
                    
                    # 保存骨骼数据到数据库
                    for frame_idx, pose_data in reference_poses.items():
                        db.save_pose_data(reference_video_id, 'reference', frame_idx, pose_data, frame_idx * 0.2)
                    
                    # 更新骨骼数据状态
                    db.update_pose_extraction_status(reference_video_id, True, 'reference')
                    
                    print(f"参考视频 {reference_video_id} 骨骼数据重新提取成功，共 {len(reference_poses)} 帧")
                else:
                    return jsonify({
                        'success': False,
                        'error': f'参考视频文件不存在: {reference_video["file_path"]}'
                    }), 400
            except Exception as e:
                print(f"重新提取参考视频骨骼数据失败: {e}")
                return jsonify({
                    'success': False,
                    'error': f'参考视频骨骼数据不存在且重新提取失败: {str(e)}'
                }), 400

        # 比较姿势差异
        print("正在比较姿势差异...")
        differences = compare_poses(reference_poses, user_poses, threshold)

        # 生成唯一的工作ID
        work_id = str(uuid.uuid4())
        
        # 创建报告目录
        report_dir = os.path.join(TEMP_FOLDER, f"report_{work_id}")
        os.makedirs(report_dir, exist_ok=True)

        # 处理标记骨骼的视频
        print("正在处理标记骨骼的视频...")
        reference_pose_video = os.path.join(report_dir, "reference_pose_video.mp4")
        user_pose_video = os.path.join(report_dir, "user_pose_video.mp4")
        
        # 检查参考视频是否已有缓存的标记骨骼视频
        if reference_video.get('pose_video_path') and os.path.exists(reference_video['pose_video_path']):
            print("使用缓存的参考视频标记骨骼视频...")
            import shutil
            shutil.copy2(reference_video['pose_video_path'], reference_pose_video)
            # 验证复制的文件
            if not os.path.exists(reference_pose_video):
                raise Exception(f"复制参考视频标记骨骼视频失败: {reference_pose_video}")
            file_size = os.path.getsize(reference_pose_video)
            if file_size == 0:
                raise Exception(f"复制的参考视频标记骨骼视频为空: {reference_pose_video}")
            print(f"参考视频标记骨骼视频复制成功，大小: {file_size} 字节")
        else:
            print("生成参考视频标记骨骼视频...")
            if not os.path.exists(reference_video['file_path']):
                raise Exception(f"参考视频文件不存在: {reference_video['file_path']}")
            generate_pose_video(reference_video['file_path'], reference_pose_video, n=5)
            # 验证生成的文件
            if not os.path.exists(reference_pose_video):
                raise Exception(f"生成的参考视频标记骨骼视频不存在: {reference_pose_video}")
            file_size = os.path.getsize(reference_pose_video)
            if file_size == 0:
                raise Exception(f"生成的参考视频标记骨骼视频为空: {reference_pose_video}")
            print(f"参考视频标记骨骼视频生成成功，大小: {file_size} 字节")
        
        # 生成用户视频的标记骨骼视频
        print(f"生成用户视频标记骨骼视频...")
        print(f"用户视频路径: {user_video['file_path']}")
        print(f"用户视频是否存在: {os.path.exists(user_video['file_path'])}")
        
        if not os.path.exists(user_video['file_path']):
            raise Exception(f"用户视频文件不存在: {user_video['file_path']}")
        
        try:
            # 先转换为标准格式（与参考视频保持一致，确保帧率准确）
            print(f"[生成用户骨骼视频] 转换视频格式以确保帧率准确...")
            converted_user_video = convert_video_to_standard_format(user_video['file_path'])
            video_for_pose = converted_user_video if converted_user_video else user_video['file_path']
            if converted_user_video and converted_user_video != user_video['file_path']:
                print(f"[生成用户骨骼视频] 格式转换成功: {converted_user_video}")
            else:
                print(f"[生成用户骨骼视频] 使用原始视频文件")
            
            # 生成视频（内部会验证）
            generate_pose_video(video_for_pose, user_pose_video, n=5)
            
            # 删除临时转换文件（如果存在）
            if converted_user_video and converted_user_video != user_video['file_path'] and os.path.exists(converted_user_video):
                try:
                    os.remove(converted_user_video)
                    print(f"[生成用户骨骼视频] 已删除临时转换文件: {converted_user_video}")
                except Exception as delete_error:
                    print(f"[生成用户骨骼视频] 警告：删除临时转换文件失败: {delete_error}")
            print(f"用户视频标记骨骼视频生成成功: {user_pose_video}")
            
            # 再次验证生成的文件（双重保险）
            if not os.path.exists(user_pose_video):
                raise Exception(f"生成的视频文件不存在: {user_pose_video}")
            
            file_size = os.path.getsize(user_pose_video)
            if file_size == 0:
                raise Exception(f"生成的视频文件为空: {user_pose_video}")
            
            print(f"生成的视频文件验证通过: {user_pose_video}, 大小: {file_size} 字节")
            
        except Exception as e:
            print(f"生成用户视频标记骨骼视频失败: {e}")
            import traceback
            traceback.print_exc()
            # 清理可能生成的不完整文件
            if os.path.exists(user_pose_video):
                try:
                    os.remove(user_pose_video)
                    print(f"已清理不完整的视频文件: {user_pose_video}")
                except:
                    pass
            raise Exception(f"生成用户视频标记骨骼视频失败: {str(e)}")

        # 生成报告
        report_path = os.path.join(report_dir, "pose_differences_report.txt")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("姿势差异报告\n")
            f.write("=" * 50 + "\n")
            f.write(f"参考视频: {reference_video['filename']}\n")
            f.write(f"用户视频: {user_video['filename']}\n")
            f.write(f"参考视频时长: {reference_video['duration']:.2f}秒, 帧率: {reference_video['fps']:.2f} FPS\n")
            f.write(f"用户视频时长: {user_video['duration']:.2f}秒, 帧率: {user_video['fps']:.2f} FPS\n")
            f.write(f"差异阈值: {threshold}\n")
            f.write(f"总差异帧数: {len(differences)}\n\n")

            for diff in differences:
                f.write(f"帧 {diff['frame_idx']}: 差异值 {diff['difference']:.3f}, 时间戳: {diff['timestamp']:.2f}秒\n")

        # 保存比较记录到数据库
        db.add_comparison_record(work_id, reference_video_id, user_video_id, threshold)
        db.update_comparison_result(work_id, len(differences), report_path)

        # 清理 differences 中的 Infinity 值，确保 JSON 可以正常序列化
        cleaned_differences = []
        for diff in differences:
            cleaned_diff = diff.copy()
            # 将 Infinity 替换为很大的数字
            diff_value = diff.get('difference')
            if isinstance(diff_value, float):
                if diff_value == float('inf') or diff_value != diff_value:  # 检查 inf 和 NaN
                    cleaned_diff['difference'] = 999999.0
            cleaned_differences.append(cleaned_diff)
        
        # 返回结果
        result = {
            'success': True,
            'work_id': work_id,
            'reference_video_id': reference_video_id,
            'user_video_id': user_video_id,
            'video_info': {
                'reference': {
                    'filename': reference_video['filename'],
                    'duration': reference_video['duration'],
                    'fps': reference_video['fps'],
                    'pose_frames': len(reference_poses)
                },
                'user': {
                    'filename': user_video['filename'],
                    'duration': user_video['duration'],
                    'fps': user_video['fps'],
                    'pose_frames': len(user_poses)
                }
            },
            'comparison': {
                'threshold': threshold,
                'total_differences': len(cleaned_differences),
                'differences': cleaned_differences
            },
            'pose_videos': {
                'reference': f"/api/pose-video/{work_id}/reference",
                'user': f"/api/pose-video/{work_id}/user"
            },
            'report_path': report_path
        }

        return jsonify(result)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/delete-user-video/<user_video_id>', methods=['DELETE'])
def delete_user_video(user_video_id):
    """删除用户视频和相关的骨骼数据"""
    try:
        # 获取用户视频信息
        user_video = db.get_video_by_id(user_video_id, 'user')
        if not user_video:
            return jsonify({
                'success': False,
                'error': f'用户视频 {user_video_id} 不存在'
            }), 404

        # 删除数据库记录
        success = db.delete_video(user_video_id, 'user')
        
        if success:
            # 删除文件系统中的文件
            try:
                import shutil
                file_path = user_video['file_path']
                work_dir = os.path.dirname(file_path)
                
                # 删除整个工作目录
                if os.path.exists(work_dir):
                    shutil.rmtree(work_dir, ignore_errors=True)
                    print(f"已删除用户视频工作目录: {work_dir}")
                
            except Exception as e:
                print(f"删除文件时出错: {e}")
                # 即使文件删除失败，数据库记录已删除，仍然返回成功

            return jsonify({
                'success': True,
                'message': f'用户视频 {user_video_id} 及其骨骼数据已删除'
            })
        else:
            return jsonify({
                'success': False,
                'error': '删除用户视频失败'
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/compare-videos', methods=['POST'])
def compare_videos():
    """比较两个视频的骨骼姿势"""
    try:
        # 检查是否有用户视频上传
        if 'user_video' not in request.files:
            return jsonify({
                'success': False,
                'error': '缺少用户视频文件'
            }), 400

        user_file = request.files['user_video']

        # 检查文件名
        if user_file.filename == '':
            return jsonify({
                'success': False,
                'error': '未选择用户视频文件'
            }), 400

        # 检查文件类型
        if not allowed_file(user_file.filename):
            return jsonify({
                'success': False,
                'error': '不支持的用户视频文件格式'
            }), 400

        # 获取参考视频ID（从请求参数中获取，如果没有则使用默认的test_video）
        reference_video_id = request.form.get('reference_video_id')
        
        # 如果没有指定参考视频ID，则获取数据库中的第一个test_video
        if not reference_video_id:
            reference_videos = db.get_reference_videos()
            if not reference_videos:
                return jsonify({
                    'success': False,
                    'error': '数据库中没有可用的教学视频，请先上传教学视频'
                }), 400
            
            # 优先选择test_video，如果没有则选择第一个
            test_video = None
            for video in reference_videos:
                if video['filename'] == 'test_video.mp4':
                    test_video = video
                    break
            
            if test_video:
                reference_video_id = test_video['video_id']
                reference_path = test_video['file_path']
                ref_filename = test_video['filename']
                ref_duration = test_video['duration']
                ref_fps = test_video['fps']
            else:
                reference_video_id = reference_videos[0]['video_id']
                reference_path = reference_videos[0]['file_path']
                ref_filename = reference_videos[0]['filename']
                ref_duration = reference_videos[0]['duration']
                ref_fps = reference_videos[0]['fps']
        else:
            # 从数据库获取指定的参考视频信息
            reference_video = db.get_video_by_id(reference_video_id, 'reference')
            if not reference_video:
                return jsonify({
                    'success': False,
                    'error': f'指定的参考视频 {reference_video_id} 不存在'
                }), 400
            
            reference_path = reference_video['file_path']
            ref_filename = reference_video['filename']
            ref_duration = reference_video['duration']
            ref_fps = reference_video['fps']

        # 生成唯一的工作ID和用户视频ID
        work_id = str(uuid.uuid4())
        user_video_id = str(uuid.uuid4())
        
        work_dir = os.path.join(TEMP_FOLDER, work_id)
        os.makedirs(work_dir)

        try:
            # 保存用户上传的文件
            user_path = os.path.join(work_dir, secure_filename(user_file.filename))
            user_file.save(user_path)

            # 获取用户视频信息
            try:
                user_duration = get_video_duration(user_path)
                user_fps = get_video_fps(user_path)
            except Exception as video_info_error:
                print(f"[上传用户视频] 警告：无法获取视频信息: {video_info_error}")
                # 设置默认值
                user_duration = 0
                user_fps = 30.0
            
            # 处理异常的duration值（webm格式可能返回极大的负数）
            if user_duration < 0 or user_duration > 86400:  # 超过24小时视为异常
                print(f"[上传用户视频] 警告：检测到异常的duration值 {user_duration}，重置为0")
                user_duration = 0

            # 保存用户视频信息到数据库
            db_result = db.add_user_video(user_video_id, user_file.filename, user_path, user_duration, user_fps)
            
            if not db_result:
                print(f"[上传用户视频] 错误：数据库插入失败")
                return jsonify({
                    'success': False,
                    'error': '保存视频信息到数据库失败'
                }), 500

            # 检查参考视频是否已有姿势数据
            reference_poses = {}
            if db.get_pose_data(reference_video_id):
                print("使用数据库中已有的参考视频姿势数据...")
                pose_data_list = db.get_pose_data(reference_video_id)
                for pose_item in pose_data_list:
                    reference_poses[pose_item['frame_index']] = pose_item['pose_data']
            else:
                print("正在提取参考视频的姿势...")
                reference_poses = extract_poses_from_video(
                    reference_path, 
                    n=5
                )
                # 保存参考视频姿势数据到数据库
                for frame_idx, pose_data in reference_poses.items():
                    db.save_pose_data(reference_video_id, 'reference', frame_idx, pose_data, frame_idx * 0.2)

            print("正在提取用户视频的姿势...")
            recorded_poses = extract_poses_from_video(
                user_path, 
                n=5
            )

            # 保存用户视频姿势数据到数据库
            for frame_idx, pose_data in recorded_poses.items():
                db.save_pose_data(user_video_id, 'user', frame_idx, pose_data, frame_idx * 0.2)


            # 比较姿势差异
            print("正在比较姿势差异...")
            threshold = float(request.form.get('threshold', 0.2))
            differences = compare_poses(reference_poses, recorded_poses, threshold)

            # 生成报告
            report_path = os.path.join(work_dir, "pose_differences_report.txt")
            with open(report_path, "w", encoding="utf-8") as f:
                f.write("姿势差异报告\n")
                f.write("=" * 50 + "\n")
                f.write(f"参考视频: {ref_filename}\n")
                f.write(f"用户视频: {user_file.filename}\n")
                f.write(f"参考视频时长: {ref_duration:.2f}秒, 帧率: {ref_fps:.2f} FPS\n")
                f.write(f"用户视频时长: {user_duration:.2f}秒, 帧率: {user_fps:.2f} FPS\n")
                f.write(f"差异阈值: {threshold}\n")
                f.write(f"总差异帧数: {len(differences)}\n\n")

                for diff in differences:
                    f.write(f"帧 {diff['frame_idx']}: 差异值 {diff['difference']:.3f}, 时间戳: {diff['timestamp']:.2f}秒\n")

            # 保存比较记录到数据库
            db.add_comparison_record(work_id, reference_video_id, user_video_id, threshold)
            db.update_comparison_result(work_id, len(differences), report_path)

            # 清理 differences 中的 Infinity 值，确保 JSON 可以正常序列化
            cleaned_differences = []
            for diff in differences:
                cleaned_diff = diff.copy()
                # 将 Infinity 替换为很大的数字
                diff_value = diff.get('difference')
                if isinstance(diff_value, float):
                    if diff_value == float('inf') or diff_value != diff_value:  # 检查 inf 和 NaN
                        cleaned_diff['difference'] = 999999.0
                cleaned_differences.append(cleaned_diff)

            # 返回结果
            result = {
                'success': True,
                'work_id': work_id,
                'reference_video_id': reference_video_id,
                'user_video_id': user_video_id,
                'video_info': {
                    'reference': {
                        'filename': ref_filename,
                        'duration': ref_duration,
                        'fps': ref_fps,
                        'pose_frames': len(reference_poses)
                    },
                    'user': {
                        'filename': user_file.filename,
                        'duration': user_duration,
                        'fps': user_fps,
                        'pose_frames': len(recorded_poses)
                    }
                },
                'comparison': {
                    'threshold': threshold,
                    'total_differences': len(cleaned_differences),
                    'differences': cleaned_differences
                },
                'report_path': report_path
            }

            return jsonify(result)

        finally:
            # 清理临时文件（可选，如果需要保留文件用于调试，可以注释掉）
            # shutil.rmtree(work_dir, ignore_errors=True)
            pass

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-report/<work_id>', methods=['GET'])
def get_report(work_id):
    """获取分析报告"""
    try:
        # 从数据库获取比较记录
        comparison_record = db.get_comparison_record(work_id)
        if not comparison_record:
            return jsonify({
                'success': False,
                'error': '比较记录不存在'
            }), 404

        report_path = comparison_record['report_path']
        if not os.path.exists(report_path):
            return jsonify({
                'success': False,
                'error': '报告文件不存在'
            }), 404

        with open(report_path, 'r', encoding='utf-8') as f:
            report_content = f.read()

        return jsonify({
            'success': True,
            'work_id': work_id,
            'report': report_content,
            'comparison_info': comparison_record
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/database/stats', methods=['GET'])
def get_database_stats():
    """获取数据库统计信息"""
    try:
        stats = db.get_database_stats()
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/videos/<video_id>/pose-data', methods=['GET'])
def get_video_pose_data(video_id):
    """获取视频的姿势数据"""
    try:
        frame_index = request.args.get('frame_index', type=int)
        pose_data = db.get_pose_data(video_id, frame_index)
        
        return jsonify({
            'success': True,
            'video_id': video_id,
            'pose_data': pose_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/videos/<video_id>', methods=['DELETE'])
def delete_video(video_id):
    """删除视频"""
    try:
        video_type = request.args.get('type', 'reference')  # 'reference' 或 'user'
        
        if db.delete_video(video_id, video_type):
            return jsonify({
                'success': True,
                'message': f'视频 {video_id} 已删除'
            })
        else:
            return jsonify({
                'success': False,
                'error': '删除视频失败'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/user-videos', methods=['GET'])
@require_auth
def list_user_videos():
    """列出用户视频（只返回永久存储的视频）"""
    try:
        # 获取当前登录用户ID
        current_user_id = str(request.current_user['user_id'])
        current_username = request.current_user['username']
        
        # 只获取当前用户的永久视频（有user_id且file_path在uploads/user目录下）
        all_videos = db.get_user_videos(current_user_id)
        
        # 过滤出永久存储的视频（file_path包含uploads/user）
        permanent_videos = []
        user_upload_folder = os.path.join(UPLOAD_FOLDER, 'user')
        user_upload_folder_abs = os.path.abspath(user_upload_folder)
        
        for video in all_videos:
            file_path = video.get('file_path', '')
            if file_path:
                file_path_abs = os.path.abspath(file_path)
                # 检查文件路径是否在永久存储目录下
                if user_upload_folder_abs in file_path_abs or file_path.startswith('uploads/user'):
                    # 添加作者信息（当前登录用户的用户名）
                    video['author'] = current_username
                    permanent_videos.append(video)
        
        return jsonify({
            'success': True,
            'videos': permanent_videos
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/comments/<video_id>', methods=['GET'], endpoint='get_comments')
def get_comments(video_id):
    """获取视频的评论列表"""
    try:
        video_type = request.args.get('video_type', 'user')  # 默认为 user
        
        comments = db.get_comments(video_id, video_type)
        
        return jsonify({
            'success': True,
            'comments': comments
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/comments', methods=['POST'], endpoint='add_comment')
@require_auth
def add_comment():
    """添加评论 - 需要登录"""
    try:
        data = request.get_json()
        video_id = data.get('video_id', '').strip()
        video_type = data.get('video_type', 'user').strip()
        content = data.get('content', '').strip()
        
        # 验证输入
        if not video_id:
            return jsonify({
                'success': False,
                'error': '视频ID不能为空'
            }), 400
        
        if not content:
            return jsonify({
                'success': False,
                'error': '评论内容不能为空'
            }), 400
        
        if video_type not in ['reference', 'user']:
            return jsonify({
                'success': False,
                'error': '无效的视频类型'
            }), 400
        
        # 获取当前用户ID
        user_id = request.current_user['user_id']
        
        # 添加评论
        if not db.add_comment(video_id, video_type, user_id, content):
            return jsonify({
                'success': False,
                'error': '添加评论失败'
            }), 500
        
        # 获取最新添加的评论（包含用户名）
        comments = db.get_comments(video_id, video_type)
        new_comment = comments[0] if comments else None
        
        return jsonify({
            'success': True,
            'comment': new_comment,
            'message': '评论添加成功'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/likes', methods=['POST'], endpoint='toggle_like')
@require_auth
def toggle_like():
    """切换点赞状态（点赞/取消点赞）- 需要登录"""
    try:
        data = request.get_json()
        video_id = data.get('video_id', '').strip()
        video_type = data.get('video_type', 'user').strip()
        
        if not video_id:
            return jsonify({
                'success': False,
                'error': '视频ID不能为空'
            }), 400
        
        user_id = request.current_user['user_id']
        
        # 切换点赞状态
        success, is_liked = db.toggle_like(video_id, video_type, user_id)
        
        if success:
            # 获取更新后的点赞数量
            like_count = db.get_like_count(video_id, video_type)
            return jsonify({
                'success': True,
                'is_liked': is_liked,
                'like_count': like_count
            })
        else:
            return jsonify({
                'success': False,
                'error': '操作失败'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/likes/<video_id>', methods=['GET'], endpoint='get_like_info')
def get_like_info(video_id):
    """获取视频的点赞信息（点赞数量和当前用户是否已点赞）"""
    try:
        video_type = request.args.get('video_type', 'user').strip()
        
        # 获取点赞数量
        like_count = db.get_like_count(video_id, video_type)
        
        # 检查当前用户是否已点赞（如果已登录）
        is_liked = False
        try:
            auth_header = request.headers.get('Authorization', '')
            token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''
            
            if token:
                result = verify_auth_token(token)
                if result and result.get('valid'):
                    user_id = result['user_id']
                    is_liked = db.is_liked(video_id, video_type, user_id)
        except Exception as e:
            # 未登录或获取用户信息失败，默认为未点赞
            print(f"获取用户点赞状态失败: {e}")
        
        return jsonify({
            'success': True,
            'like_count': like_count,
            'is_liked': is_liked
        })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload-reference', methods=['POST'])
@require_auth
def upload_reference_video():
    """上传参考视频并异步提取骨骼数据 - 需要登录"""
    try:
        if 'video' not in request.files:
            return jsonify({
                'success': False,
                'error': '没有上传文件'
            }), 400

        file = request.files['video']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': '未选择文件'
            }), 400

        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': '不支持的文件格式'
            }), 400

        # 生成唯一视频ID和任务ID
        video_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())
        
        # 保存参考视频（原始文件，用于播放）
        filename = secure_filename(file.filename)
        original_filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(original_filepath)

        # 获取视频信息（使用原始视频）
        duration = get_video_duration(original_filepath)
        fps = get_video_fps(original_filepath)

        # 生成缩略图（使用原始视频）
        thumbnail_path = generate_video_thumbnail(original_filepath, THUMBNAIL_FOLDER)

        # 获取可选的描述、标签、作者和标题
        description = request.form.get('description', '')
        tags = request.form.get('tags', '')
        author = request.form.get('author', '')
        title = request.form.get('title', '')

        # 保存到数据库（保存原始视频路径，用于播放）
        if not db.add_reference_video(video_id, filename, original_filepath, duration, fps, description, tags, author, title, thumbnail_path):
            return jsonify({
                'success': False,
                'error': '保存到数据库失败'
            }), 500

        # 创建异步任务
        db.create_async_task(task_id, video_id, 'reference', 'pose_extraction')
        
        # 启动后台线程处理骨骼提取（传入原始文件路径，函数内部会转换）
        thread = threading.Thread(
            target=async_extract_poses_and_generate_video,
            args=(task_id, video_id, original_filepath, 'reference')
        )
        thread.daemon = True
        thread.start()
        
        print(f"视频 {filename} 上传成功，已启动后台任务 {task_id} 进行骨骼提取")

        return jsonify({
            'success': True,
            'video_id': video_id,
            'task_id': task_id,
            'filename': filename,
            'filepath': original_filepath,
            'duration': duration,
            'fps': fps,
            'description': description,
            'tags': tags,
            'author': author,
            'title': title,
            'thumbnail_path': thumbnail_path,
            'pose_data_extracted': False,
            'pose_video_generated': False,
            'message': '参考视频上传成功，正在后台处理骨骼数据'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload-user-video-permanent', methods=['POST'])
@require_auth
def upload_user_video_permanent():
    """上传用户视频到永久存储（支持标题）- 需要登录"""
    try:
        if 'video' not in request.files:
            return jsonify({
                'success': False,
                'error': '没有上传文件'
            }), 400

        file = request.files['video']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': '未选择文件'
            }), 400

        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': '不支持的文件格式'
            }), 400

        # 获取标题（必填）
        title = request.form.get('title', '').strip()
        if not title:
            return jsonify({
                'success': False,
                'error': '视频标题不能为空'
            }), 400

        # 生成唯一视频ID和任务ID
        video_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())
        
        # 保存用户视频到永久存储（UPLOAD_FOLDER/user目录）
        user_upload_folder = os.path.join(UPLOAD_FOLDER, 'user')
        if not os.path.exists(user_upload_folder):
            os.makedirs(user_upload_folder)
        
        filename = secure_filename(file.filename)
        original_filepath = os.path.join(user_upload_folder, filename)
        file.save(original_filepath)

        # 获取视频信息（使用原始视频）
        duration = get_video_duration(original_filepath)
        fps = get_video_fps(original_filepath)

        # 获取当前登录用户ID
        current_user_id = str(request.current_user['user_id'])

        # 保存到数据库（保存原始视频路径，用于播放）
        if not db.add_user_video(video_id, filename, original_filepath, duration, fps, user_id=current_user_id, title=title):
            return jsonify({
                'success': False,
                'error': '保存到数据库失败'
            }), 500

        # 用户视频不需要处理骨骼数据，直接返回成功
        print(f"用户视频 {filename} 上传成功（永久存储）")

        return jsonify({
            'success': True,
            'video_id': video_id,
            'filename': filename,
            'filepath': original_filepath,
            'duration': duration,
            'fps': fps,
            'title': title,
            'message': '用户视频上传成功'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload-user-video-from-work', methods=['POST'])
@require_auth
def upload_user_video_from_work():
    """从workId获取用户视频并上传到永久存储（支持标题）- 需要登录"""
    try:
        data = request.get_json()
        work_id = data.get('work_id')
        title = data.get('title', '').strip()
        
        if not work_id:
            return jsonify({
                'success': False,
                'error': '缺少work_id'
            }), 400
        
        if not title:
            return jsonify({
                'success': False,
                'error': '视频标题不能为空'
            }), 400

        # 从数据库获取比较记录
        comparison_record = db.get_comparison_record(work_id)
        if not comparison_record:
            return jsonify({
                'success': False,
                'error': '比较记录不存在'
            }), 404
        
        user_video_id = comparison_record['user_video_id']
        
        # 获取用户视频信息
        user_video = db.get_video_by_id(user_video_id, 'user')
        if not user_video:
            return jsonify({
                'success': False,
                'error': '用户视频不存在'
            }), 404
        
        # 获取原始视频文件路径
        original_file_path = user_video.get('file_path')
        if not original_file_path or not os.path.exists(original_file_path):
            return jsonify({
                'success': False,
                'error': '原始视频文件不存在'
            }), 404

        # 生成唯一视频ID和任务ID
        new_video_id = str(uuid.uuid4())
        task_id = str(uuid.uuid4())
        
        # 保存用户视频到永久存储（UPLOAD_FOLDER/user目录）
        user_upload_folder = os.path.join(UPLOAD_FOLDER, 'user')
        if not os.path.exists(user_upload_folder):
            os.makedirs(user_upload_folder)
        
        # 复制原始文件到永久存储
        filename = user_video.get('filename', f'video_{new_video_id}.mp4')
        new_filepath = os.path.join(user_upload_folder, secure_filename(filename))
        
        import shutil
        shutil.copy2(original_file_path, new_filepath)

        # 获取视频信息（使用原视频的信息）
        duration = user_video.get('duration', 0)
        fps = user_video.get('fps', 30.0)

        # 获取当前登录用户ID
        current_user_id = str(request.current_user['user_id'])

        # 保存到数据库（使用user_id，不使用session_id）
        if not db.add_user_video(new_video_id, filename, new_filepath, duration, fps, user_id=current_user_id, title=title):
            return jsonify({
                'success': False,
                'error': '保存到数据库失败'
            }), 500

        # 用户视频不需要处理骨骼数据，直接返回成功
        print(f"用户视频 {filename} 从workId {work_id} 上传成功（永久存储）")

        return jsonify({
            'success': True,
            'video_id': new_video_id,
            'filename': filename,
            'filepath': new_filepath,
            'duration': duration,
            'fps': fps,
            'title': title,
            'message': '用户视频上传成功'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reference-videos', methods=['GET'])
def list_reference_videos():
    """列出所有参考视频"""
    try:
        videos = db.get_reference_videos()
        
        # 为每个视频添加是否已提取姿势数据和标记骨骼视频的标记
        for video in videos:
            video['has_pose_data'] = bool(db.get_pose_data(video['video_id']))
            video['has_pose_video'] = bool(video.get('pose_video_generated', 0))
        
        return jsonify({
            'success': True,
            'videos': videos
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """获取异步任务状态"""
    try:
        task = db.get_task_status(task_id)
        
        if not task:
            return jsonify({
                'success': False,
                'error': '任务不存在'
            }), 404
        
        # 如果任务已完成，检查视频的实际状态
        if task['status'] == 'completed':
            video_id = task['video_id']
            video_type = task['video_type']
            
            video_info = db.get_video_by_id(video_id, video_type)
            if video_info:
                task['pose_data_extracted'] = bool(video_info.get('pose_data_extracted', 0))
                task['pose_video_generated'] = bool(video_info.get('pose_video_generated', 0))
                task['pose_frames'] = len(db.get_pose_data(video_id))
        
        return jsonify({
            'success': True,
            'task': task
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/videos/<video_id>/tasks', methods=['GET'])
def get_video_tasks(video_id):
    """获取视频相关的所有任务"""
    try:
        tasks = db.get_tasks_by_video(video_id)
        
        return jsonify({
            'success': True,
            'video_id': video_id,
            'tasks': tasks
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reference-videos/default', methods=['GET'])
def get_default_reference_video():
    """获取默认的参考视频（优先返回test_video）"""
    try:
        videos = db.get_reference_videos()
        if not videos:
            return jsonify({
                'success': False,
                'error': '没有可用的参考视频'
            }), 404
        
        # 优先选择test_video
        default_video = None
        for video in videos:
            if video['filename'] == 'test_video.mp4':
                default_video = video
                break
        
        if not default_video:
            default_video = videos[0]  # 如果没有test_video，选择第一个
        
        # 添加是否已提取姿势数据的标记
        default_video['has_pose_data'] = bool(db.get_pose_data(default_video['video_id']))
        
        return jsonify({
            'success': True,
            'video': default_video
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def get_video_mimetype(file_path):
    """根据文件扩展名获取视频MIME类型"""
    ext = os.path.splitext(file_path)[1].lower()
    mime_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
    }
    return mime_types.get(ext, 'video/mp4')

@app.route('/video/<video_id>')
def stream_video(video_id):
    """视频流媒体播放 - 支持通过 http://IP:端口/video/视频ID 访问"""
    try:
        # 支持通过查询参数指定视频类型，如果没有指定则自动查找
        video_type = request.args.get('type', None)
        
        if video_type:
            # 如果指定了类型，直接查找对应类型的视频
            video_info = db.get_video_by_id(video_id, video_type)
        else:
            # 如果没有指定类型，先尝试查找参考视频，再查找用户视频
            # 虽然UUID理论上不会冲突，但这样更安全
            video_info = db.get_video_by_id(video_id, 'reference')
            if not video_info:
                video_info = db.get_video_by_id(video_id, 'user')
        
        if not video_info:
            return jsonify({'error': '视频不存在'}), 404
        
        file_path = video_info['file_path']
        
        if not os.path.exists(file_path):
            return jsonify({'error': '视频文件不存在'}), 404
        
        # 根据文件扩展名获取正确的MIME类型
        mimetype = get_video_mimetype(file_path)
        
        # 支持范围请求（Range requests）
        range_header = request.headers.get('Range', None)
        
        if range_header:
            # 处理范围请求
            import re
            size = os.path.getsize(file_path)
            byte1, byte2 = 0, None
            
            m = re.search(r'(\d+)-(\d*)', range_header)
            g = m.groups()
            
            if g[0]: byte1 = int(g[0])
            if g[1]: byte2 = int(g[1])
            
            if byte2 is None:
                byte2 = size - 1
            
            length = byte2 - byte1 + 1
            
            with open(file_path, 'rb') as f:
                f.seek(byte1)
                data = f.read(length)
            
            from flask import Response
            rv = Response(data, 
                         206,
                         mimetype=mimetype,
                         direct_passthrough=True)
            rv.headers['Content-Range'] = f'bytes {byte1}-{byte2}/{size}'
            rv.headers['Accept-Ranges'] = 'bytes'
            rv.headers['Content-Length'] = str(length)
            return rv
        else:
            # 完整文件请求
            from flask import send_file
            response = send_file(file_path, mimetype=mimetype)
            response.headers['Accept-Ranges'] = 'bytes'
            return response
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/video-stats', methods=['GET'])
def get_video_stats():
    """获取视频存储统计信息"""
    try:
        stats = db.get_database_stats()
        return jsonify({
            'success': True,
            'stats': {
                'total_reference_videos': stats['reference_videos_count'],
                'total_user_videos': stats['user_videos_count'],
                'total_comparisons': stats['comparison_records_count'],
                'total_pose_data': stats['pose_data_count']
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/thumbnail/<video_id>', methods=['GET'])
def get_thumbnail(video_id):
    """获取视频缩略图"""
    try:
        # 从数据库获取缩略图路径
        video = db.get_video_by_id(video_id, 'reference')
        if not video:
            return jsonify({
                'success': False,
                'error': '视频不存在'
            }), 404
        
        thumbnail_path = video.get('thumbnail_path')
        if not thumbnail_path:
            return jsonify({
                'success': False,
                'error': '缩略图路径不存在'
            }), 404
        
        # 如果路径是相对路径，转换为绝对路径
        if not os.path.isabs(thumbnail_path):
            # 尝试多个可能的路径
            possible_paths = [
                thumbnail_path,  # 原始相对路径
                os.path.join(THUMBNAIL_FOLDER, os.path.basename(thumbnail_path)),  # 在THUMBNAIL_FOLDER中查找
                os.path.join(os.getcwd(), thumbnail_path),  # 相对于当前工作目录
            ]
            
            # 找到第一个存在的路径
            thumbnail_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    thumbnail_path = path
                    break
            
            if not thumbnail_path:
                return jsonify({
                    'success': False,
                    'error': f'缩略图文件不存在，尝试的路径: {possible_paths}'
                }), 404
        elif not os.path.exists(thumbnail_path):
            return jsonify({
                'success': False,
                'error': '缩略图文件不存在'
            }), 404
        
        # 返回缩略图文件
        from flask import send_file
        return send_file(thumbnail_path, mimetype='image/jpeg')
        
    except Exception as e:
        print(f"获取缩略图错误: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pose-video/<work_id>/<video_type>')
def get_pose_video(work_id, video_type):
    """获取标记骨骼的视频"""
    try:
        if video_type not in ['reference', 'user']:
            return jsonify({'error': '无效的视频类型'}), 400
        
        # 构建视频文件路径
        report_dir = os.path.join(TEMP_FOLDER, f"report_{work_id}")
        if video_type == 'reference':
            video_file = os.path.join(report_dir, "reference_pose_video.mp4")
        else:
            video_file = os.path.join(report_dir, "user_pose_video.mp4")
        
        print(f"[获取标记骨骼视频] work_id={work_id}, video_type={video_type}")
        print(f"[获取标记骨骼视频] 视频文件路径: {video_file}")
        print(f"[获取标记骨骼视频] 报告目录是否存在: {os.path.exists(report_dir)}")
        print(f"[获取标记骨骼视频] 视频文件是否存在: {os.path.exists(video_file)}")
        
        if not os.path.exists(report_dir):
            print(f"[获取标记骨骼视频] 错误: 报告目录不存在: {report_dir}")
            return jsonify({'error': f'报告目录不存在: {report_dir}'}), 404
        
        if not os.path.exists(video_file):
            print(f"[获取标记骨骼视频] 错误: 视频文件不存在: {video_file}")
            # 列出目录内容以便调试
            if os.path.exists(report_dir):
                files = os.listdir(report_dir)
                print(f"[获取标记骨骼视频] 报告目录中的文件: {files}")
            return jsonify({'error': f'视频文件不存在: {video_file}'}), 404
        
        # 检查文件大小
        file_size = os.path.getsize(video_file)
        print(f"[获取标记骨骼视频] 视频文件大小: {file_size} 字节")
        if file_size == 0:
            print(f"[获取标记骨骼视频] 警告: 视频文件大小为0")
            return jsonify({'error': '视频文件为空'}), 500
        
        # 验证视频文件格式（使用ffprobe检查）
        video_valid = False
        try:
            import subprocess
            cmd = ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name,duration', '-of', 'json', video_file]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                import json
                data = json.loads(result.stdout)
                format_name = data.get('format', {}).get('format_name', 'unknown')
                duration = data.get('format', {}).get('duration', '0')
                print(f"[获取标记骨骼视频] 视频格式: {format_name}, 时长: {duration}秒")
                # 检查格式是否包含 mp4 或 mov（浏览器兼容格式）
                if 'mp4' in format_name.lower() or 'mov' in format_name.lower() or 'quicktime' in format_name.lower():
                    video_valid = True
                else:
                    print(f"[获取标记骨骼视频] 警告: 视频格式可能不兼容: {format_name}")
            else:
                print(f"[获取标记骨骼视频] 警告: 无法验证视频格式: {result.stderr}")
                # 如果 ffprobe 失败，尝试使用 OpenCV 验证
                try:
                    import cv2
                    cap = cv2.VideoCapture(video_file)
                    if cap.isOpened():
                        ret, frame = cap.read()
                        cap.release()
                        if ret and frame is not None:
                            video_valid = True
                            print(f"[获取标记骨骼视频] 使用 OpenCV 验证成功")
                        else:
                            print(f"[获取标记骨骼视频] 错误: OpenCV 无法读取视频帧")
                    else:
                        print(f"[获取标记骨骼视频] 错误: OpenCV 无法打开视频文件")
                except Exception as cv_error:
                    print(f"[获取标记骨骼视频] OpenCV 验证失败: {cv_error}")
        except FileNotFoundError:
            print(f"[获取标记骨骼视频] 警告: ffprobe 未找到，跳过格式验证")
            # 如果 ffprobe 不可用，尝试使用 OpenCV 验证
            try:
                import cv2
                cap = cv2.VideoCapture(video_file)
                if cap.isOpened():
                    ret, frame = cap.read()
                    cap.release()
                    if ret and frame is not None:
                        video_valid = True
                        print(f"[获取标记骨骼视频] 使用 OpenCV 验证成功")
                    else:
                        print(f"[获取标记骨骼视频] 错误: OpenCV 无法读取视频帧")
                else:
                    print(f"[获取标记骨骼视频] 错误: OpenCV 无法打开视频文件")
            except Exception as cv_error:
                print(f"[获取标记骨骼视频] OpenCV 验证失败: {cv_error}")
        except Exception as e:
            print(f"[获取标记骨骼视频] 警告: 验证视频格式时出错: {e}")
        
        # 如果视频无效，返回错误
        if not video_valid:
            print(f"[获取标记骨骼视频] 错误: 视频文件无效或格式不兼容")
            return jsonify({
                'error': '视频文件无效或格式不兼容，无法播放',
                'details': '请重新生成视频或检查视频文件'
            }), 500
        
        # 支持范围请求
        range_header = request.headers.get('Range', None)
        
        if range_header:
            # 处理范围请求
            import re
            size = os.path.getsize(video_file)
            byte1, byte2 = 0, None
            
            m = re.search(r'(\d+)-(\d*)', range_header)
            g = m.groups()
            
            if g[0]: byte1 = int(g[0])
            if g[1]: byte2 = int(g[1])
            
            if byte2 is None:
                byte2 = size - 1
            
            length = byte2 - byte1 + 1
            
            with open(video_file, 'rb') as f:
                f.seek(byte1)
                data = f.read(length)
            
            from flask import Response
            rv = Response(data, 
                         206,
                         mimetype='video/mp4',
                         direct_passthrough=True)
            rv.headers['Content-Range'] = f'bytes {byte1}-{byte2}/{size}'
            rv.headers['Accept-Ranges'] = 'bytes'
            rv.headers['Content-Length'] = str(length)
            return rv
        else:
            # 完整文件请求
            from flask import send_file
            response = send_file(video_file, mimetype='video/mp4')
            response.headers['Accept-Ranges'] = 'bytes'
            return response
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/frame-comparison/<work_id>', methods=['GET'])
def get_frame_comparison(work_id):
    """获取逐帧对比数据"""
    try:
        # 从数据库获取比较记录
        comparison_record = db.get_comparison_record(work_id)
        if not comparison_record:
            return jsonify({
                'success': False,
                'error': '比较记录不存在'
            }), 404
        
        reference_video_id = comparison_record['reference_video_id']
        user_video_id = comparison_record['user_video_id']
        
        # 获取视频信息
        reference_video = db.get_video_by_id(reference_video_id, 'reference')
        user_video = db.get_video_by_id(user_video_id, 'user')
        
        if not reference_video or not user_video:
            return jsonify({
                'success': False,
                'error': '视频信息不存在'
            }), 404
        
        # 获取骨骼数据
        reference_poses = {}
        reference_pose_data = db.get_pose_data(reference_video_id)
        if reference_pose_data:
            for pose_item in reference_pose_data:
                reference_poses[pose_item['frame_index']] = pose_item['pose_data']
        
        user_poses = {}
        user_pose_data = db.get_pose_data(user_video_id)
        if user_pose_data:
            for pose_item in user_pose_data:
                user_poses[pose_item['frame_index']] = pose_item['pose_data']
        
        # 计算逐帧差异
        frame_comparisons = []
        ref_frames = sorted(reference_poses.keys())
        user_frames = sorted(user_poses.keys())
        
        min_frames = min(len(ref_frames), len(user_frames))
        
        # 获取两个视频的FPS信息，用于准确计算时间戳
        ref_fps = reference_video.get('fps', 5)  # 默认5fps
        user_fps = user_video.get('fps', 5)      # 默认5fps
        
        for i in range(min_frames):
            ref_frame_idx = ref_frames[i]
            user_frame_idx = user_frames[i]
            
            ref_pose = reference_poses[ref_frame_idx]
            user_pose = user_poses[user_frame_idx]
            
            # 计算姿势差异
            pose_diff = calculate_pose_difference(ref_pose, user_pose)
            
            # 使用实际帧索引计算时间戳，确保时间戳基于实际对比的帧数
            # 使用参考视频的FPS来计算时间戳，因为时间轴以参考视频为准
            timestamp = ref_frame_idx / ref_fps
            
            # 判断骨骼数据状态
            has_pose_data = ref_pose is not None and user_pose is not None
            has_difference = False
            pose_quality_issue = False
            
            if has_pose_data:
                # 有骨骼数据时，检查质量
                # 使用很大的数字（999999.0）表示质量差，而不是 Infinity
                if pose_diff >= 999999.0:
                    # 骨骼提取质量差（有效点太少）
                    pose_quality_issue = True
                    has_difference = True  # 标记为有差异
                elif pose_diff > comparison_record['threshold']:
                    # 差异过大
                    has_difference = True
                else:
                    # 正常差异
                    has_difference = False
            else:
                # 无骨骼数据时，标记为无法比较
                pose_diff = -1
                has_difference = True  # 标记为有差异（因为无法比较）
            
            # 清理 Infinity 值，确保 JSON 可以正常序列化
            cleaned_diff = float(pose_diff)
            if isinstance(cleaned_diff, float) and (cleaned_diff == float('inf') or cleaned_diff != cleaned_diff):  # 检查 inf 和 NaN
                cleaned_diff = 999999.0
            
            frame_comparisons.append({
                'frame_index': i,
                'reference_frame': ref_frame_idx,
                'user_frame': user_frame_idx,
                'timestamp': timestamp,
                'difference': cleaned_diff,
                'has_difference': has_difference,
                'has_pose_data': has_pose_data,
                'pose_quality_issue': pose_quality_issue
            })
        
        return jsonify({
            'success': True,
            'work_id': work_id,
            'video_info': {
                'reference': {
                    'filename': reference_video['filename'],
                    'duration': reference_video['duration'],
                    'fps': reference_video['fps']
                },
                'user': {
                    'filename': user_video['filename'],
                    'duration': user_video['duration'],
                    'fps': user_video['fps']
                }
            },
            'frame_comparisons': frame_comparisons,
            'threshold': comparison_record['threshold']
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("启动舞蹈姿势对比服务...")
    print("服务地址: http://localhost:8128")
    print("API文档:")
    print("  - 健康检查: GET /api/health")
    print("  - 上传参考视频: POST /api/upload-reference")
    print("  - 列出参考视频: GET /api/reference-videos")
    print("  - 获取默认参考视频: GET /api/reference-videos/default")
    print("  - 上传用户视频并提取骨骼: POST /api/upload-user-video")
    print("  - 比较已上传的视频: POST /api/compare-uploaded-videos")
    print("  - 删除用户视频: DELETE /api/delete-user-video/<user_video_id>")
    print("  - 比较视频: POST /api/compare-videos (只需上传用户视频)")
    print("  - 获取报告: GET /api/get-report/<work_id>")
    print("  - 数据库统计: GET /api/database/stats")
    print("  - 视频播放: GET /video/<video_id>")
    print("  - 视频统计: GET /api/video-stats")
    
    app.run(host='0.0.0.0', port=8128, debug=True)
