from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import cv2
import mediapipe as mp
import numpy as np
import tempfile
import shutil
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime
from database import db

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 配置上传文件夹
UPLOAD_FOLDER = 'uploads'
TEMP_FOLDER = 'temp'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
if not os.path.exists(TEMP_FOLDER):
    os.makedirs(TEMP_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB 限制

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_video_duration(video_file):
    """获取视频时长（秒）"""
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        raise ValueError("无法打开视频文件")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    if fps <= 0:
        raise ValueError("视频帧率无效")
    
    duration = frame_count / fps
    cap.release()
    return duration

def get_video_fps(video_file):
    """获取视频帧率"""
    cap = cv2.VideoCapture(video_file)
    if not cap.isOpened():
        raise ValueError("无法打开视频文件")
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    
    if fps <= 0:
        raise ValueError("视频帧率无效")
    
    return fps

def extract_poses_from_video(video_file, n=5):
    """从视频中提取姿势数据并返回字典（等距提取，包含无骨骼数据的帧）"""
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
    
    # 可选：进一步精简版本（如果性能需要）
    # selected_landmarks = [0, 11, 12, 15, 16, 23, 24, 27, 28]  # 9个核心点位

    mp_pose = mp.solutions.pose
    cap = cv2.VideoCapture(video_file)
    frame_idx = 0
    poses_data = {}

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
                else:
                    # 没有检测到骨骼数据，存储None作为标记
                    poses_data[frame_idx] = None
            frame_idx += 1
    cap.release()
    return poses_data

def generate_pose_video(video_file, output_file, n=5):
    """生成标记骨骼的视频（带音频）"""
    import subprocess
    import tempfile
    import os
    
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
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # 创建临时视频文件（无音频）
    temp_video = tempfile.mktemp(suffix='_temp_video.mp4')
    
    # 创建视频写入器 - 使用更兼容的编码格式
    fourcc = cv2.VideoWriter_fourcc(*'H264')
    out = cv2.VideoWriter(temp_video, fourcc, fps, (width, height))
    
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
    
    # 使用ffmpeg合并视频和音频
    try:
        cmd = [
            'ffmpeg', '-y',  # -y 覆盖输出文件
            '-i', temp_video,  # 输入视频（无音频）
            '-i', video_file,  # 输入原视频（有音频）
            '-c:v', 'copy',  # 复制视频流
            '-c:a', 'aac',  # 音频编码为AAC
            '-map', '0:v:0',  # 使用第一个输入的视频流
            '-map', '1:a:0',  # 使用第二个输入的音频流
            '-shortest',  # 以较短的流为准
            output_file
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"FFmpeg错误: {result.stderr}")
            # 如果ffmpeg失败，使用无音频版本
            import shutil
            shutil.copy2(temp_video, output_file)
        else:
            print("成功添加音频到生成的视频")
    except FileNotFoundError:
        print("FFmpeg未找到，生成无音频版本")
        # 如果ffmpeg不可用，使用无音频版本
        import shutil
        shutil.copy2(temp_video, output_file)
    except Exception as e:
        print(f"音频处理失败: {e}")
        # 如果出现其他错误，使用无音频版本
        import shutil
        shutil.copy2(temp_video, output_file)
    finally:
        # 清理临时文件
        if os.path.exists(temp_video):
            os.remove(temp_video)
    
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
        return float('inf')

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
        return float('inf')

    if valid_points == 0:
        return float('inf')

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

@app.route('/api/upload-user-video', methods=['POST'])
def upload_user_video():
    """上传用户视频并提取骨骼数据（临时缓存）"""
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

        # 获取参考视频ID
        reference_video_id = request.form.get('reference_video_id')
        if not reference_video_id:
            return jsonify({
                'success': False,
                'error': '缺少参考视频ID'
            }), 400

        # 验证参考视频是否存在
        reference_video = db.get_video_by_id(reference_video_id, 'reference')
        if not reference_video:
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
            # 保存用户上传的文件
            user_path = os.path.join(work_dir, secure_filename(user_file.filename))
            user_file.save(user_path)

            # 获取用户视频信息
            user_duration = get_video_duration(user_path)
            user_fps = get_video_fps(user_path)

            # 保存用户视频信息到数据库
            db.add_user_video(user_video_id, user_file.filename, user_path, user_duration, user_fps)

            # 提取用户视频的骨骼数据
            print(f"正在提取用户视频 {user_video_id} 的骨骼数据...")
            user_poses = extract_poses_from_video(
                user_path, 
                n=5
            )

            # 保存用户视频骨骼数据到数据库
            for frame_idx, pose_data in user_poses.items():
                db.save_pose_data(user_video_id, 'user', frame_idx, pose_data, frame_idx * 0.2)


            # 标记骨骼数据已提取
            db.update_pose_extraction_status(user_video_id, True)

            return jsonify({
                'success': True,
                'user_video_id': user_video_id,
                'filename': user_file.filename,
                'filepath': user_path,
                'duration': user_duration,
                'fps': user_fps,
                'pose_data_extracted': True,
                'message': '用户视频上传成功，骨骼数据已提取'
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
        else:
            print("生成参考视频标记骨骼视频...")
            generate_pose_video(reference_video['file_path'], reference_pose_video, n=5)
        
        # 生成用户视频的标记骨骼视频
        print("生成用户视频标记骨骼视频...")
        generate_pose_video(user_video['file_path'], user_pose_video, n=5)

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
                'total_differences': len(differences),
                'differences': differences
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
            user_duration = get_video_duration(user_path)
            user_fps = get_video_fps(user_path)

            # 保存用户视频信息到数据库
            db.add_user_video(user_video_id, user_file.filename, user_path, user_duration, user_fps)

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
                    'total_differences': len(differences),
                    'differences': differences
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
def list_user_videos():
    """列出用户视频"""
    try:
        user_id = request.args.get('user_id')
        videos = db.get_user_videos(user_id)
        
        return jsonify({
            'success': True,
            'videos': videos
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload-reference', methods=['POST'])
def upload_reference_video():
    """上传参考视频并自动提取骨骼数据"""
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

        # 生成唯一视频ID
        video_id = str(uuid.uuid4())
        
        # 保存参考视频
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        # 获取视频信息
        duration = get_video_duration(filepath)
        fps = get_video_fps(filepath)

        # 获取可选的描述、标签、作者和标题
        description = request.form.get('description', '')
        tags = request.form.get('tags', '')
        author = request.form.get('author', '')
        title = request.form.get('title', '')

        # 保存到数据库
        if not db.add_reference_video(video_id, filename, filepath, duration, fps, description, tags, author, title):
            return jsonify({
                'success': False,
                'error': '保存到数据库失败'
            }), 500

        # 自动提取骨骼数据并生成标记骨骼的视频
        try:
            print(f"正在为参考视频 {filename} 提取骨骼数据...")
            
            # 提取骨骼数据
            poses_data = extract_poses_from_video(
                filepath, 
                n=5
            )
            
            print(f"提取到 {len(poses_data)} 帧骨骼数据")
            
            # 保存骨骼数据到数据库
            for frame_idx, pose_data in poses_data.items():
                db.save_pose_data(video_id, 'reference', frame_idx, pose_data, frame_idx * 0.2)
            
            # 更新姿势数据状态
            db.update_pose_extraction_status(video_id, True, 'reference')
            
            print(f"参考视频 {filename} 骨骼数据提取完成")
            
            # 生成标记骨骼的视频
            print(f"正在为参考视频 {filename} 生成标记骨骼的视频...")
            pose_video_path = os.path.join(output_dir, "pose_video.mp4")
            generate_pose_video(filepath, pose_video_path, n=5)
            
            # 更新标记骨骼视频路径
            db.update_pose_video_path(video_id, pose_video_path)
            
            print(f"参考视频 {filename} 标记骨骼视频生成完成")
            
        except Exception as pose_error:
            print(f"处理骨骼数据失败: {pose_error}")
            # 即使骨骼数据处理失败，也返回成功，但添加警告信息
            return jsonify({
                'success': True,
                'video_id': video_id,
                'filename': filename,
                'filepath': filepath,
                'duration': duration,
                'fps': fps,
                'description': description,
                'tags': tags,
                'author': author,
                'title': title,
                'pose_data_extracted': False,
                'pose_video_generated': False,
                'warning': f'视频上传成功，但骨骼数据处理失败: {str(pose_error)}'
            })

        return jsonify({
            'success': True,
            'video_id': video_id,
            'filename': filename,
            'filepath': filepath,
            'duration': duration,
            'fps': fps,
            'description': description,
            'tags': tags,
            'author': author,
            'title': title,
            'pose_data_extracted': True,
            'pose_video_generated': True,
            'pose_frames': len(poses_data),
            'message': '参考视频上传成功，骨骼数据和标记骨骼视频已自动生成'
        })

    except Exception as e:
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

@app.route('/video/<video_id>')
def stream_video(video_id):
    """视频流媒体播放 - 支持通过 http://IP:端口/video/视频ID 访问"""
    try:
        # 从数据库获取视频信息
        video_info = db.get_video_by_id(video_id)
        
        if not video_info:
            return jsonify({'error': '视频不存在'}), 404
        
        file_path = video_info['file_path']
        
        if not os.path.exists(file_path):
            return jsonify({'error': '视频文件不存在'}), 404
        
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
                         mimetype='video/mp4',
                         direct_passthrough=True)
            rv.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{size}')
            rv.headers.add('Accept-Ranges', 'bytes')
            rv.headers.add('Content-Length', str(length))
            return rv
        else:
            # 完整文件请求
            from flask import send_file
            response = send_file(file_path, mimetype='video/mp4')
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
        
        if not os.path.exists(video_file):
            return jsonify({'error': '视频文件不存在'}), 404
        
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
            rv.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{size}')
            rv.headers.add('Accept-Ranges', 'bytes')
            rv.headers.add('Content-Length', str(length))
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
                if pose_diff == float('inf'):
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
            
            frame_comparisons.append({
                'frame_index': i,
                'reference_frame': ref_frame_idx,
                'user_frame': user_frame_idx,
                'timestamp': timestamp,
                'difference': float(pose_diff),
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
