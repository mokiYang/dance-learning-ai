# 舞蹈学习应用

这是一个基于React和TypeScript的舞蹈学习Web应用，支持跟学录制功能。

## 功能特性

- 📹 视频列表展示
- 🎬 视频播放器
- 📱 摄像头实时录制
- 🎯 倒计时自动录制
- 📹 自动视频录制
- 🔄 录制回放功能

## 技术栈

- React 18
- TypeScript
- React Router
- WebRTC (摄像头和录制)

## 安装和运行

1. 安装依赖：
```bash
pnpm install
```

2. 启动开发服务器：
```bash
pnpm start
```

3. 打开浏览器访问 `http://localhost:3000`

## 使用说明

### 1. 视频列表页面
- 显示所有可用的舞蹈教学视频
- 点击视频卡片进入播放页面

### 2. 视频播放页面
- 播放教学视频
- 点击"跟学"按钮启动录制模式

### 3. 跟学模式
- 启动摄像头
- 倒计时3秒后自动开始录制
- 同时播放教学视频
- 视频播放结束后自动停止录制

### 4. 录制功能
- 自动开始录制摄像头画面
- 录制时长与教学视频相同
- 录制完成后自动停止并显示回放

### 5. 回放功能
- 查看录制的视频
- 可以重新录制

## 项目结构

```
src/
├── components/          # React组件
│   ├── VideoList.tsx   # 视频列表组件
│   └── VideoPlayer.tsx # 视频播放组件
├── utils/              # 工具类
│   └── videoRecorder.ts # 视频录制工具
├── types/              # TypeScript类型定义
│   └── index.ts
├── data/               # 数据文件
│   └── videos.ts       # 视频数据
├── App.tsx             # 主应用组件
└── index.tsx           # 应用入口
```

## 注意事项

1. **摄像头权限**：应用需要访问摄像头进行录制
2. **浏览器兼容性**：建议使用Chrome或Edge浏览器以获得最佳体验
3. **视频格式**：支持MP4、WebM等常见视频格式

## 开发说明

### 添加新视频
在 `src/data/videos.ts` 中添加新的视频信息：

```typescript
{
  id: 'unique-id',
  title: '视频标题',
  src: '/path/to/video.mp4',
  duration: 30 // 秒
}
```

## 许可证

MIT License 