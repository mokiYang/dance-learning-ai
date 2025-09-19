# 舞蹈姿势对比系统项目总结

## 项目概述

本项目实现了一个完整的舞蹈姿势对比系统，包含Python后端服务和React前端界面。系统能够分析舞蹈视频中的骨骼姿势，比较参考视频和用户录制视频的差异，并生成详细的对比报告。

## 系统架构

### 后端服务 (PythonProject1/)
- **技术栈**: Flask + MediaPipe + OpenCV
- **功能**: 视频处理、骨骼检测、姿势对比分析
- **API接口**: RESTful API，支持跨域请求

### 前端界面 (dance/)
- **技术栈**: React + TypeScript + Less
- **功能**: 视频上传、用户交互、结果展示
- **组件**: 视频对比组件、API服务封装

## 核心功能

### 1. 视频处理
- 支持多种视频格式 (MP4, AVI, MOV, MKV)
- 自动提取视频信息 (时长、帧率)
- 视频文件上传和管理

### 2. 骨骼检测
- 使用MediaPipe进行人体姿势检测
- 提取13个关键骨骼点坐标
- 支持3D坐标和可见性分析

### 3. 姿势对比
- 逐帧比较参考视频和用户视频
- 可调节差异阈值
- 计算3D欧几里得距离

### 4. 结果分析
- 生成详细的差异报告
- 列出差异较大的帧
- 提供时间戳和差异值

## 文件结构

```
PythonProject1/
├── app.py                 # Flask主应用
├── start_server.py        # 启动脚本
├── run_server.sh          # Shell启动脚本
├── test_api.py           # API测试脚本
├── requirements.txt      # Python依赖
├── README.md            # 详细文档
├── uploads/             # 上传文件目录
├── temp/                # 临时文件目录
└── dance.py             # 原始舞蹈分析脚本

dance/
├── src/
│   ├── services/
│   │   └── api.ts       # API服务封装
│   └── components/
│       ├── VideoComparison.tsx    # 视频对比组件
│       └── VideoComparison.less   # 组件样式
└── package.json
```

## API接口

### 1. 健康检查
```
GET /api/health
```

### 2. 上传参考视频
```
POST /api/upload-reference
Content-Type: multipart/form-data
```

### 3. 获取参考视频列表
```
GET /api/reference-videos
```

### 4. 比较视频
```
POST /api/compare-videos
Content-Type: multipart/form-data
```

### 5. 获取分析报告
```
GET /api/get-report/<work_id>
```

## 使用方法

### 启动后端服务

```bash
# 方法1: 使用Shell脚本 (推荐)
cd PythonProject1
./run_server.sh

# 方法2: 使用Python脚本
cd PythonProject1
python start_server.py

# 方法3: 直接运行
cd PythonProject1
python app.py
```

### 启动前端服务

```bash
cd dance
npm install
npm start
```

### 测试API

```bash
cd PythonProject1
python test_api.py
```

## 技术特点

### 后端特点
- **模块化设计**: 功能分离，易于维护
- **错误处理**: 完善的异常处理机制
- **文件管理**: 自动创建目录，临时文件清理
- **跨域支持**: 支持前端跨域请求
- **可扩展性**: 易于添加新功能

### 前端特点
- **TypeScript**: 类型安全，更好的开发体验
- **组件化**: 可复用的React组件
- **响应式设计**: 适配不同屏幕尺寸
- **用户体验**: 加载状态、错误提示、动画效果
- **API封装**: 统一的API调用接口

## 性能优化

### 视频处理优化
- 每5帧提取一次姿势数据，减少计算量
- 只比较可见性较高的骨骼点
- 支持大文件上传 (最大500MB)

### 前端优化
- 懒加载组件
- 防抖处理
- 错误边界处理

## 部署建议

### 开发环境
- Python 3.8+
- Node.js 16+
- 足够的磁盘空间用于视频存储

### 生产环境
- 使用Gunicorn部署Flask应用
- 配置Nginx反向代理
- 使用Redis缓存
- 配置日志系统

## 扩展功能

### 可能的改进
1. **实时分析**: 支持实时视频流分析
2. **多用户支持**: 用户认证和权限管理
3. **数据库集成**: 存储分析历史和结果
4. **机器学习**: 使用深度学习模型提高准确性
5. **移动端支持**: 开发移动应用
6. **云端部署**: 支持云服务部署

### 性能提升
1. **并行处理**: 使用多进程处理视频
2. **GPU加速**: 利用GPU进行骨骼检测
3. **缓存机制**: 缓存已处理的视频数据
4. **CDN**: 使用CDN加速文件传输

## 故障排除

### 常见问题
1. **依赖安装失败**: 升级pip，检查Python版本
2. **端口冲突**: 修改端口号
3. **CORS错误**: 检查Flask-CORS配置
4. **视频处理失败**: 检查视频格式和文件完整性

### 调试方法
1. 查看Flask日志输出
2. 使用test_api.py测试接口
3. 检查浏览器开发者工具
4. 验证文件权限和路径

## 总结

本系统成功实现了舞蹈姿势对比的核心功能，提供了完整的Web解决方案。通过前后端分离的架构，系统具有良好的可维护性和扩展性。用户可以通过直观的Web界面上传视频，系统会自动进行骨骼检测和姿势对比，生成详细的分析报告。

该系统可以作为舞蹈教学、健身指导、动作纠正等应用的基础平台，具有广阔的应用前景。
