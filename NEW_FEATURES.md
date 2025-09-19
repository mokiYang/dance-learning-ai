# 舞蹈学习系统 - 新功能说明

## 新增功能概述

本次更新为舞蹈学习系统添加了结果页面和文件上传功能，实现了完整的视频分析和骨骼提取流程。

## 主要功能

### 1. 结果页面 (`/result/:id`)
- **位置**: `dance/src/components/VideoResult/`
- **功能**: 
  - 自动接收录制的视频数据，无需用户再次选择文件
  - 自动开始上传和分析流程
  - 显示分析结果和对比数据
  - 支持重新录制功能
  - 简洁的单列布局，专注于用户录制的视频

### 2. 文件上传和骨骼提取
- **API接口**: `POST /api/upload-user-video`
- **功能**:
  - 上传用户视频文件
  - 自动提取骨骼数据
  - 临时缓存骨骼数据到数据库
  - 支持多种视频格式 (mp4, avi, mov, mkv)

### 3. 视频比较分析
- **API接口**: `POST /api/compare-uploaded-videos`
- **功能**:
  - 使用已上传的视频进行比较
  - 生成详细的差异报告
  - 显示帧级别的差异数据

### 4. 临时缓存管理
- **API接口**: `DELETE /api/delete-user-video/:id`
- **功能**:
  - 删除用户视频文件
  - 清理相关的骨骼数据
  - 释放存储空间

## 技术实现

### 前端组件
- `VideoResult`: 新的结果页面组件
- 更新了 `VideoPlayer` 组件，添加跳转到结果页面的按钮
- 更新了 `App.tsx` 路由配置
- 扩展了 `api.ts` 服务，添加新的API接口

### 后端API
- `upload_user_video()`: 处理用户视频上传和骨骼提取
- `compare_uploaded_videos()`: 比较已上传的视频
- `delete_user_video()`: 删除用户视频和骨骼数据
- 更新了数据库模块，添加姿势提取状态管理

### 数据库更新
- 添加了 `update_pose_extraction_status()` 方法
- 支持用户视频的临时存储和管理
- 自动清理相关的骨骼数据

## 使用流程

1. **录制视频**: 在视频播放器页面录制舞蹈视频
2. **自动跳转**: 录制完成后自动跳转到结果页面
3. **自动上传**: 录制的视频数据自动传递到结果页面，无需用户再次选择文件
4. **自动分析**: 系统自动开始上传和分析，提取骨骼数据并进行比较
5. **查看结果**: 显示详细的对比结果和差异数据
6. **重新录制**: 如果不满意可以返回播放器重新录制

## 文件结构

```
dance/src/components/VideoResult/
├── index.tsx          # 结果页面组件
└── index.less         # 样式文件

PythonProject1/
├── app.py             # 更新了API接口
└── database.py        # 更新了数据库方法
```

## API接口说明

### 上传用户视频
```
POST /api/upload-user-video
Content-Type: multipart/form-data

参数:
- user_video: 视频文件
- reference_video_id: 参考视频ID

返回:
{
  "success": true,
  "user_video_id": "uuid",
  "filename": "video.mp4",
  "duration": 10.5,
  "fps": 30.0,
  "pose_data_extracted": true
}
```

### 比较已上传的视频
```
POST /api/compare-uploaded-videos
Content-Type: application/x-www-form-urlencoded

参数:
- user_video_id: 用户视频ID
- reference_video_id: 参考视频ID
- threshold: 差异阈值 (默认0.3)

返回:
{
  "success": true,
  "work_id": "uuid",
  "video_info": {...},
  "comparison": {
    "total_differences": 15,
    "differences": [...]
  }
}
```

### 删除用户视频
```
DELETE /api/delete-user-video/:user_video_id

返回:
{
  "success": true,
  "message": "用户视频已删除"
}
```

## 注意事项

1. **临时缓存**: 用户视频和骨骼数据是临时存储的，不会永久保存
2. **文件清理**: 重新上传时会自动删除之前的视频文件和骨骼数据
3. **存储限制**: 单个视频文件最大500MB
4. **支持格式**: mp4, avi, mov, mkv
5. **骨骼提取**: 使用MediaPipe进行骨骼点提取，每5帧提取一次

## 启动说明

1. 启动Python后端服务:
```bash
cd PythonProject1
python app.py
```

2. 启动前端开发服务器:
```bash
cd dance
npm run dev
```

3. 访问应用:
- 前端: http://localhost:3000
- 后端API: http://localhost:8128
