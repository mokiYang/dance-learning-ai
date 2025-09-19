# 舞蹈学习系统数据库功能说明

## 概述

本系统集成了SQLite本地数据库，用于存储视频文件信息、骨骼分析结果和比较记录，避免重复解析视频，提高系统性能。

## 数据库架构

### 1. 教学视频表 (reference_videos)
存储教学视频的基本信息和骨骼分析状态。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| video_id | TEXT | 唯一视频ID |
| filename | TEXT | 文件名 |
| file_path | TEXT | 文件存储路径 |
| duration | REAL | 视频时长（秒） |
| fps | REAL | 视频帧率 |
| upload_time | TIMESTAMP | 上传时间 |
| pose_data_path | TEXT | 姿势数据文件路径 |
| pose_data_extracted | BOOLEAN | 是否已提取姿势数据 |
| pose_extraction_time | TIMESTAMP | 姿势数据提取时间 |
| description | TEXT | 视频描述 |
| tags | TEXT | 视频标签 |

### 2. 用户视频表 (user_videos)
存储用户上传的视频信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| video_id | TEXT | 唯一视频ID |
| filename | TEXT | 文件名 |
| file_path | TEXT | 文件存储路径 |
| duration | REAL | 视频时长（秒） |
| fps | REAL | 视频帧率 |
| upload_time | TIMESTAMP | 上传时间 |
| pose_data_path | TEXT | 姿势数据文件路径 |
| pose_data_extracted | BOOLEAN | 是否已提取姿势数据 |
| pose_extraction_time | TIMESTAMP | 姿势数据提取时间 |
| user_id | TEXT | 用户ID |
| session_id | TEXT | 会话ID |

### 3. 视频比较记录表 (comparison_records)
存储视频比较的历史记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| comparison_id | TEXT | 唯一比较ID |
| reference_video_id | TEXT | 参考视频ID |
| user_video_id | TEXT | 用户视频ID |
| comparison_time | TIMESTAMP | 比较时间 |
| threshold | REAL | 差异阈值 |
| total_differences | INTEGER | 总差异帧数 |
| report_path | TEXT | 报告文件路径 |
| status | TEXT | 比较状态 |

### 4. 姿势数据表 (pose_data)
存储具体的骨骼姿势数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| video_id | TEXT | 视频ID |
| video_type | TEXT | 视频类型（reference/user） |
| frame_index | INTEGER | 帧索引 |
| pose_data | TEXT | JSON格式的姿势数据 |
| timestamp | REAL | 时间戳 |

## API接口

### 1. 数据库统计
```
GET /api/database/stats
```
返回数据库统计信息，包括视频数量、比较记录数量等。

### 2. 上传参考视频（增强版）
```
POST /api/upload-reference
```
支持上传视频文件并保存到数据库，可包含描述和标签信息。

**参数：**
- `video`: 视频文件
- `description`: 视频描述（可选）
- `tags`: 视频标签（可选）

**返回：**
```json
{
  "success": true,
  "video_id": "uuid",
  "filename": "video.mp4",
  "duration": 22.1,
  "fps": 30.0,
  "description": "舞蹈教学视频",
  "tags": "舞蹈,教学"
}
```

### 3. 获取参考视频列表
```
GET /api/reference-videos
```
返回所有教学视频的详细信息，包括姿势数据提取状态。

### 4. 获取用户视频列表
```
GET /api/user-videos?user_id=xxx
```
返回用户视频列表，支持按用户ID筛选。

### 5. 获取姿势数据
```
GET /api/videos/{video_id}/pose-data?frame_index=xxx
```
获取指定视频的姿势数据，支持按帧索引筛选。

### 6. 删除视频
```
DELETE /api/videos/{video_id}?type=reference
```
删除指定视频及其相关数据。

**参数：**
- `type`: 视频类型（reference/user）

### 7. 视频比较（增强版）
```
POST /api/compare-videos
```
比较两个视频并保存结果到数据库。

**返回：**
```json
{
  "success": true,
  "work_id": "comparison_uuid",
  "reference_video_id": "reference_uuid",
  "user_video_id": "user_uuid",
  "video_info": {...},
  "comparison": {...}
}
```

### 8. 获取报告（增强版）
```
GET /api/get-report/{work_id}
```
获取比较报告，包含数据库中的比较记录信息。

## 数据库操作类

### DanceDatabase 类

提供了完整的数据库操作方法：

#### 视频管理
- `add_reference_video()`: 添加教学视频
- `add_user_video()`: 添加用户视频
- `get_reference_videos()`: 获取教学视频列表
- `get_user_videos()`: 获取用户视频列表
- `get_video_by_id()`: 根据ID获取视频信息
- `delete_video()`: 删除视频

#### 姿势数据管理
- `save_pose_data()`: 保存姿势数据
- `get_pose_data()`: 获取姿势数据
- `update_pose_data_path()`: 更新姿势数据路径

#### 比较记录管理
- `add_comparison_record()`: 添加比较记录
- `update_comparison_result()`: 更新比较结果
- `get_comparison_record()`: 获取比较记录

#### 统计信息
- `get_database_stats()`: 获取数据库统计信息

## 性能优化

### 1. 避免重复解析
- 系统会检查视频是否已提取姿势数据
- 如果已提取，直接使用数据库中的结果
- 避免重复的MediaPipe处理

### 2. 索引优化
- 为常用查询字段创建索引
- 提高查询性能

### 3. 数据缓存
- 姿势数据存储在数据库中
- 支持快速检索和比较

## 使用示例

### 1. 初始化数据库
```python
from database import db

# 数据库会自动初始化
print("数据库已就绪")
```

### 2. 添加教学视频
```python
video_id = str(uuid.uuid4())
success = db.add_reference_video(
    video_id=video_id,
    filename="dance_tutorial.mp4",
    file_path="/uploads/dance_tutorial.mp4",
    duration=45.2,
    fps=30.0,
    description="基础舞蹈教学",
    tags="舞蹈,基础,教学"
)
```

### 3. 保存姿势数据
```python
pose_data = [[x, y, z, visibility], ...]
db.save_pose_data(video_id, 'reference', frame_index, pose_data, timestamp)
```

### 4. 获取统计信息
```python
stats = db.get_database_stats()
print(f"教学视频数量: {stats['reference_videos_count']}")
print(f"用户视频数量: {stats['user_videos_count']}")
```

## 测试

### 运行数据库功能测试
```bash
python test_database.py
```

### 运行API集成测试
```bash
python test_database_api.py
```

### 运行完整API测试
```bash
python test_api.py
```

## 文件结构

```
PythonProject1/
├── database.py              # 数据库操作模块
├── app.py                   # Flask应用（已集成数据库）
├── test_database.py         # 数据库功能测试
├── test_database_api.py     # 数据库API测试
├── test_api.py              # 完整API测试
├── dance_learning.db        # SQLite数据库文件
├── uploads/                 # 视频文件存储目录
└── temp/                    # 临时文件目录
```

## 注意事项

1. **数据库文件位置**: 数据库文件 `dance_learning.db` 会在首次运行时自动创建
2. **数据备份**: 建议定期备份数据库文件
3. **存储空间**: 注意监控数据库文件大小，特别是姿势数据表
4. **并发访问**: SQLite支持并发读取，但写入时需要加锁
5. **数据清理**: 定期清理不需要的视频文件和数据库记录

## 扩展功能

### 1. 数据导出
可以添加功能将数据库数据导出为JSON或CSV格式

### 2. 数据备份
可以添加自动备份功能

### 3. 数据迁移
可以添加数据库版本升级功能

### 4. 性能监控
可以添加数据库性能监控功能
