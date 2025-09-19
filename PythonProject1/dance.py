import os.path
import cv2
import mediapipe as mp
import numpy as np
import time
from datetime import datetime


# import ffmpeg  # 注释掉ffmpeg相关

def select_video_file():
    return r"/Users/yangmuyan/project/PythonProject1/recorded_video.mp4"


def get_video_duration(video_file):
    """获取视频时长（秒）"""
    cap = cv2.VideoCapture(video_file)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps
    cap.release()
    return duration


def get_video_fps(video_file):
    """获取视频帧率"""
    cap = cv2.VideoCapture(video_file)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return fps


def extract_pose_every_n_frames(video_file, n=5):
    """从视频中提取姿势数据并返回字典（只使用数据库存储）"""
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
            frame_idx += 1
    cap.release()
    return poses_data


def record_video_with_pose_guidance(reference_video_path, output_video_path="recorded_video.mp4"):
    """录制视频并提供姿势指导"""
    # 获取参考视频信息
    reference_duration = get_video_duration(reference_video_path)
    reference_fps = get_video_fps(reference_video_path)

    print(f"参考视频时长: {reference_duration:.2f}秒")
    print(f"参考视频帧率: {reference_fps:.2f} FPS")

    # 提取参考视频的第一帧姿势作为起始姿势
    reference_start_pose = extract_starting_pose(reference_video_path)

    # 初始化摄像头
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("无法打开摄像头")
        return None

    # 设置摄像头参数
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, reference_fps)

    # 初始化视频写入器
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, reference_fps, (640, 480))

    # 初始化MediaPipe Pose
    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils

    recording = False
    start_time = None
    elapsed_time = 0

    print("Please adjust posture")
    print("'r' for begin，'q' for quit")

    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5) as pose:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # 水平翻转帧（镜像效果）
            frame = cv2.flip(frame, 1)

            # 处理姿势检测
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image_rgb)

            # 绘制姿势关键点
            if results.pose_landmarks:
                mp_drawing.draw_landmarks(
                    frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

                # 计算与参考姿势的相似度
                if reference_start_pose is not None:
                    similarity = calculate_pose_similarity(results.pose_landmarks, reference_start_pose)
                    cv2.putText(frame, f"similarity: {similarity:.2f}", (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                    # 提供姿势指导
                    if similarity < 0.7:
                        cv2.putText(frame, "Please adjust posture", (10, 60),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                    else:
                        cv2.putText(frame, "detected, can start", (10, 60),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            else:
                cv2.putText(frame, "can't find posture", (10, 60),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            # 显示录制状态
            if recording:
                elapsed_time = time.time() - start_time
                remaining_time = max(0, reference_duration - elapsed_time)
                cv2.putText(frame, f"Recording...  remain: {remaining_time:.1f}s", (10, 90),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

                # 检查是否录制完成
                if elapsed_time >= reference_duration:
                    break
            else:
                cv2.putText(frame, "'r' for begin", (10, 90),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            # 写入视频帧
            if recording:
                out.write(frame)

            cv2.imshow('record', frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('r') and not recording:
                recording = True
                start_time = time.time()
                print("start...")

    cap.release()
    out.release()
    cv2.destroyAllWindows()

    if recording:
        print(f"录制完成，视频保存为: {output_video_path}")
        return output_video_path
    else:
        print("录制被取消")
        return None


def extract_starting_pose(video_file):
    """提取视频第一帧的姿势"""
    mp_pose = mp.solutions.pose
    cap = cv2.VideoCapture(video_file)

    with mp_pose.Pose(static_image_mode=True) as pose:
        ret, frame = cap.read()
        if ret:
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(image_rgb)
            cap.release()
            return results.pose_landmarks

    cap.release()
    return None


def calculate_pose_similarity(landmarks1, landmarks2):
    """计算两个姿势的相似度"""
    if landmarks1 is None or landmarks2 is None:
        return 0.0

    # 使用优化后的关键点位
    selected_landmarks = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

    total_distance = 0
    valid_points = 0

    for i in selected_landmarks:
        if i < len(landmarks1.landmark) and i < len(landmarks2.landmark):
            lm1 = landmarks1.landmark[i]
            lm2 = landmarks2.landmark[i]

            # 只考虑可见性较高的点
            if lm1.visibility > 0.5 and lm2.visibility > 0.5:
                distance = np.sqrt((lm1.x - lm2.x) ** 2 + (lm1.y - lm2.y) ** 2)
                total_distance += distance
                valid_points += 1

    if valid_points == 0:
        return 0.0

    avg_distance = total_distance / valid_points
    # 将距离转换为相似度（距离越小，相似度越高）
    similarity = max(0, 1 - avg_distance * 2)
    return similarity


def compare_poses(reference_poses, recorded_poses, threshold=0.3):
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
                'difference': pose_diff
            })

    return differences


def calculate_pose_difference(pose1, pose2):
    """计算两个姿势数据之间的差异"""
    if len(pose1) != len(pose2):
        return float('inf')

    total_diff = 0
    valid_points = 0

    for i in range(len(pose1)):
        # 只比较可见性较高的点
        if pose1[i][3] > 0.5 and pose2[i][3] > 0.5:
            # 计算3D距离
            diff = np.sqrt(
                (pose1[i][0] - pose2[i][0]) ** 2 +
                (pose1[i][1] - pose2[i][1]) ** 2 +
                (pose1[i][2] - pose2[i][2]) ** 2
            )
            total_diff += diff
            valid_points += 1

    if valid_points == 0:
        return float('inf')

    return total_diff / valid_points


def extract_poses_from_video(video_file, n=5):
    """从视频中提取姿势数据并返回字典（只使用数据库存储）"""
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
            frame_idx += 1
    cap.release()
    return poses_data


def main_workflow():
    """主要工作流程"""
    # 1. 选择参考视频
    reference_video_path = select_video_file()
    if not reference_video_path:
        print("未选择参考视频文件，程序退出")
        return

    print(f"参考视频路径: {reference_video_path}")

    # 2. 提取参考视频的姿势
    print("正在提取参考视频的姿势...")
    reference_poses = extract_poses_from_video(reference_video_path, n=5)
    print(f"提取了 {len(reference_poses)} 个姿势帧")

    # 3. 录制用户视频
    print("\n准备录制用户视频...")
    recorded_video_path = record_video_with_pose_guidance(reference_video_path)

    if recorded_video_path is None:
        print("录制失败，程序退出")
        return

    # 4. 提取录制视频的姿势
    print("正在提取录制视频的姿势...")
    recorded_poses = extract_poses_from_video(recorded_video_path, n=5)
    print(f"提取了 {len(recorded_poses)} 个姿势帧")

    # 5. 比较姿势差异
    print("正在比较姿势差异...")
    differences = compare_poses(reference_poses, recorded_poses, threshold=0.3)

    # 6. 输出结果
    print(f"\n找到 {len(differences)} 个差异较大的帧:")
    for diff in differences:
        print(f"帧 {diff['frame_idx']}: 差异值 {diff['difference']:.3f}")

    # 7. 保存差异报告
    with open("pose_differences_report.txt", "w", encoding="utf-8") as f:
        f.write("姿势差异报告\n")
        f.write("=" * 50 + "\n")
        f.write(f"参考视频: {reference_video_path}\n")
        f.write(f"录制视频: {recorded_video_path}\n")
        f.write(f"总差异帧数: {len(differences)}\n\n")

        for diff in differences:
            f.write(f"帧 {diff['frame_idx']}: 差异值 {diff['difference']:.3f}\n")

    print(f"\n差异报告已保存到: pose_differences_report.txt")


if __name__ == '__main__':
    main_workflow()