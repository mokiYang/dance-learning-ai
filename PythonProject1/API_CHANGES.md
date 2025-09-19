# 舞蹈学习系统 API 更新说明

## 主要变化

### 1. 视频比较接口优化

**之前的接口：**
- 需要同时上传参考视频和用户视频
- 每次都会重新处理参考视频

**现在的接口：**
- 只需要上传用户视频
- 自动从数据库读取已有的教学视频
- 优先使用test_video.mp4作为默认参考视频

### 2. 新增API接口

#### 获取默认参考视频
```
GET /api/reference-videos/default
```

返回默认的参考视频信息（优先返回test_video.mp4）。

**响应示例：**
```json
{
  "success": true,
  "video": {
    "video_id": "e5aa6516-e338-4d6a-9117-04c671ebdc6d",
    "filename": "test_video.mp4",
    "duration": 12.5,
    "fps": 30.0,
    "has_pose_data": true
  }
}
```

#### 获取参考视频列表（增强版）
```
GET /api/reference-videos
```

现在会返回每个视频是否已提取姿势数据的标记。

**响应示例：**
```json
{
  "success": true,
  "videos": [
    {
      "video_id": "e5aa6516-e338-4d6a-9117-04c671ebdc6d",
      "filename": "test_video.mp4",
      "duration": 12.5,
      "fps": 30.0,
      "has_pose_data": true
    }
  ]
}
```

### 3. 视频比较接口更新

#### 新的使用方式
```
POST /api/compare-videos
```

**请求参数：**
- `user_video`: 用户视频文件（必需）
- `reference_video_id`: 参考视频ID（可选，不提供则使用默认视频）
- `threshold`: 差异阈值（可选，默认0.3）

**示例请求：**
```bash
curl -X POST http://localhost:8128/api/compare-videos \
  -F "user_video=@recorded_video.mp4" \
  -F "threshold=0.3"
```

**响应示例：**
```json
{
  "success": true,
  "work_id": "12345678-1234-1234-1234-123456789abc",
  "reference_video_id": "e5aa6516-e338-4d6a-9117-04c671ebdc6d",
  "user_video_id": "98765432-4321-4321-4321-cba987654321",
  "video_info": {
    "reference": {
      "filename": "test_video.mp4",
      "duration": 12.5,
      "fps": 30.0,
      "pose_frames": 25
    },
    "user": {
      "filename": "recorded_video.mp4",
      "duration": 12.3,
      "fps": 30.0,
      "pose_frames": 24
    }
  },
  "comparison": {
    "threshold": 0.3,
    "total_differences": 5,
    "differences": [...]
  }
}
```

## 性能优化

### 1. 姿势数据缓存
- 参考视频的姿势数据只提取一次，存储在数据库中
- 后续比较直接使用缓存的姿势数据，避免重复处理
- 大幅提升比较速度

### 2. 文件管理优化
- 清理了temp文件夹中的重复test_video文件
- 确保数据库中只有一个test_video记录
- 减少存储空间占用

## 使用建议

### 1. 前端集成
```javascript
// 获取默认参考视频
const response = await fetch('/api/reference-videos/default');
const { video } = await response.json();

// 上传用户视频进行比较
const formData = new FormData();
formData.append('user_video', userVideoFile);
formData.append('threshold', 0.3);

const compareResponse = await fetch('/api/compare-videos', {
  method: 'POST',
  body: formData
});
```

### 2. 测试新功能
运行测试脚本验证新功能：
```bash
python test_new_api.py
```

### 3. 服务启动
```bash
python app.py
```

## 数据库状态

当前数据库状态：
- 教学视频：2个（包含test_video.mp4）
- 用户视频：1个
- 比较记录：0个
- 姿势数据：116条记录

## 注意事项

1. **首次使用**：如果参考视频还没有提取姿势数据，系统会自动提取并缓存
2. **文件路径**：确保uploads文件夹中有test_video.mp4文件
3. **权限**：确保temp文件夹有写入权限
4. **网络**：前端需要能够访问8128端口

## 故障排除

### 常见问题

1. **"数据库中没有可用的教学视频"**
   - 解决方案：先使用`/api/upload-reference`上传教学视频

2. **"指定的参考视频不存在"**
   - 解决方案：检查reference_video_id是否正确，或使用默认视频

3. **姿势数据提取失败**
   - 解决方案：检查视频文件是否损坏，确保安装了mediapipe依赖

### 日志查看
服务运行时会输出详细的处理日志，包括：
- 姿势数据提取进度
- 文件处理状态
- 错误信息
