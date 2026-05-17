import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiService, ReferenceVideo } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import VideoUpload, { VideoUploadRef } from "../VideoUpload";
import VideoCard from "../VideoCard";
import { showToast } from "../Toast/ToastContainer";
import "./index.less";

/**
 * 新手入门视频列表页
 *
 * 与首页 VideoList 的差异：
 *  - 仅展示 category=beginner 的参考视频（后端过滤）
 *  - 顶部不再有 教学/用户 切换 Tabs，改为标题 + 返回首页按钮
 *  - 仅 admin 可上传（VideoUpload mode='beginner'）
 *  - 列表项点击进入 /video/:id 后续录制同款、对比姿势等流程完全复用现有逻辑
 */
const BeginnerVideoList: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [videos, setVideos] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<VideoUploadRef>(null);

  // 正在处理的视频任务（与 VideoList 保持一致的进度展示能力）
  const [processingTasks, setProcessingTasks] = useState<Map<string, { taskId: string; progress: number }>>(new Map());
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    fetchVideos();

    // 监听全局上传触发事件（来自底部 TabBar 的 + 按钮）
    const handleUploadTrigger = () => {
      if (!isAdmin) {
        showToast("只有管理员可以上传新手入门教学视频", "error");
        return;
      }
      uploadRef.current?.handleFileUploadClick();
    };
    window.addEventListener('triggerUpload', handleUploadTrigger);

    return () => {
      window.removeEventListener('triggerUpload', handleUploadTrigger);
      pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getReferenceVideos('beginner');
      if (response.success) {
        setVideos(response.videos || []);
      } else {
        setError("获取新手入门视频列表失败");
      }
    } catch (err) {
      setError("网络错误，请稍后重试");
      console.error("获取新手入门视频列表失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleVideoClick = (videoId: string) => {
    // 复用首页详情路由；带上 from=beginner 以便详情页可识别返回路径（非必须，预留）
    navigate(`/video/${videoId}?tab=reference&from=beginner`);
  };

  const handleUploadSuccess = (taskId?: string, videoId?: string) => {
    fetchVideos();
    if (taskId && videoId) {
      startPollingTask(taskId, videoId);
    }
  };

  const handleVideoDeleted = () => {
    showToast('视频已删除', 'success');
    fetchVideos();
  };

  const startPollingTask = (taskId: string, videoId: string) => {
    setProcessingTasks(prev => new Map(prev).set(videoId, { taskId, progress: 0 }));
    const pollInterval = setInterval(async () => {
      try {
        const result = await apiService.getTaskStatus(taskId);
        if (!result.success) throw new Error('获取任务状态失败');
        const { task } = result;
        setProcessingTasks(prev => {
          const newMap = new Map(prev);
          newMap.set(videoId, { taskId, progress: task.progress });
          return newMap;
        });
        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(videoId);
          setProcessingTasks(prev => {
            const newMap = new Map(prev);
            newMap.delete(videoId);
            return newMap;
          });
          fetchVideos();
        }
      } catch (e) {
        console.error('轮询任务状态失败:', e);
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(videoId);
        setProcessingTasks(prev => {
          const newMap = new Map(prev);
          newMap.delete(videoId);
          return newMap;
        });
      }
    }, 1500);
    pollingIntervalsRef.current.set(videoId, pollInterval);
  };

  return (
    <div className="beginner-video-list-container">
      {/* 隐藏的上传组件，仅 admin 渲染（避免非 admin 也注入 file input） */}
      {isAdmin && (
        <VideoUpload
          ref={uploadRef}
          mode="beginner"
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* 顶部标题栏：返回按钮 + 标题（替代首页的 Tabs 切换） */}
      <div className="beginner-header">
        <button
          type="button"
          className="beginner-header__back"
          onClick={() => navigate('/')}
          aria-label="返回首页"
        >
          <span className="back-icon">←</span>
          <span className="back-text">返回首页</span>
        </button>
        <h1 className="beginner-header__title">新手入门教学视频</h1>
        {/* 占位让标题视觉居中（与返回按钮等宽） */}
        <div className="beginner-header__placeholder" aria-hidden="true" />
      </div>

      {/* 视频网格 - 复用首页 VideoCard，与首页保持视觉一致 */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner">加载中...</div>
        </div>
      ) : error ? (
        <div className="error-container">
          <div className="error-message">{error}</div>
          <button onClick={() => fetchVideos()}>重试</button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.length === 0 ? (
            <div className="empty-state">
              <p>{isAdmin ? "暂无新手入门视频，点击底部 + 上传第一个吧！" : "暂无新手入门视频，敬请期待"}</p>
            </div>
          ) : (
            videos.map((video) => {
              const isProcessing = processingTasks.has(video.video_id);
              const taskInfo = processingTasks.get(video.video_id);
              return (
                <VideoCard
                  key={video.video_id || video.filename}
                  videoId={video.video_id}
                  videoType="reference"
                  title={video.title || video.filename}
                  author={video.author}
                  thumbnailPath={video.thumbnail_path}
                  onClick={() => handleVideoClick(video.video_id)}
                  isProcessing={isProcessing}
                  processingProgress={taskInfo?.progress || 0}
                  onDeleted={handleVideoDeleted}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default BeginnerVideoList;
