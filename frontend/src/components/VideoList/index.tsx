import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiService, ReferenceVideo, getVideoUrl } from "../../services/api";
import VideoUpload, { VideoUploadRef } from "../VideoUpload";
import "./index.less";

const VideoList: React.FC = () => {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<VideoUploadRef>(null);
  
  // 正在处理的视频任务
  const [processingTasks, setProcessingTasks] = useState<Map<string, { taskId: string; progress: number }>>(new Map());
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 使用ref来跟踪请求状态和缓存
  const requestRef = useRef<Promise<any> | null>(null);
  const cacheRef = useRef<{ data: ReferenceVideo[]; timestamp: number } | null>(
    null
  );
  const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

  useEffect(() => {
    fetchVideos();

    // 监听自定义上传事件
    const handleUploadTrigger = () => {
      if (uploadRef.current) {
        uploadRef.current.handleFileUploadClick();
      }
    };

    window.addEventListener('triggerUpload', handleUploadTrigger);
    
    // 清理轮询定时器
    return () => {
      window.removeEventListener('triggerUpload', handleUploadTrigger);
      pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
  }, []);

  const fetchVideos = async (forceRefresh: boolean = false) => {
    // 如果强制刷新，清除缓存
    if (forceRefresh) {
      cacheRef.current = null;
    }
    
    // 检查缓存是否有效
    if (
      cacheRef.current &&
      Date.now() - cacheRef.current.timestamp < CACHE_DURATION
    ) {
      setVideos(cacheRef.current.data);
      setLoading(false);
      return;
    }

    // 如果已经有请求在进行中，等待它完成
    if (requestRef.current) {
      try {
        await requestRef.current;
        return;
      } catch (err) {
        // 如果之前的请求失败，继续执行新的请求
        console.error("之前的请求失败:", err);
      }
    }

    try {
      setLoading(true);
      setError(null);

      // 创建新的请求并保存引用
      const request = apiService.getReferenceVideos();
      requestRef.current = request;

      const response = await request;

      if (response.success) {
        // 更新缓存
        cacheRef.current = {
          data: response.videos,
          timestamp: Date.now(),
        };
        setVideos(response.videos);
      } else {
        setError("获取视频列表失败");
      }
    } catch (err) {
      setError("网络错误，请稍后重试");
      console.error("获取视频列表失败:", err);
    } finally {
      setLoading(false);
      requestRef.current = null; // 清除请求引用
    }
  };

  const handleVideoClick = (video_id: string) => {
    navigate(`/video/${video_id}`);
  };

  const handleUploadSuccess = (taskId?: string, videoId?: string) => {
    // 上传成功后立即强制刷新视频列表（清除缓存）
    fetchVideos(true);
    
    // 如果有taskId，开始轮询该视频的处理进度
    if (taskId && videoId) {
      startPollingTask(taskId, videoId);
    }
  };
  
  // 开始轮询任务状态
  const startPollingTask = async (taskId: string, videoId: string) => {
    // 添加到处理中的任务列表
    setProcessingTasks(prev => new Map(prev).set(videoId, { taskId, progress: 0 }));
    
    // 创建轮询定时器
    const pollInterval = setInterval(async () => {
      try {
        const result = await apiService.getTaskStatus(taskId);
        
        if (!result.success) {
          throw new Error('获取任务状态失败');
        }
        
        const { task } = result;
        
        // 更新进度
        setProcessingTasks(prev => {
          const newMap = new Map(prev);
          newMap.set(videoId, { taskId, progress: task.progress });
          return newMap;
        });
        
        // 任务完成或失败，停止轮询
        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(pollInterval);
          pollingIntervalsRef.current.delete(videoId);
          
          // 从处理中列表移除
          setProcessingTasks(prev => {
            const newMap = new Map(prev);
            newMap.delete(videoId);
            return newMap;
          });
          
          // 刷新视频列表以获取最新数据
          fetchVideos(true);
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error);
        // 发生错误也停止轮询
        clearInterval(pollInterval);
        pollingIntervalsRef.current.delete(videoId);
        setProcessingTasks(prev => {
          const newMap = new Map(prev);
          newMap.delete(videoId);
          return newMap;
        });
      }
    }, 1500); // 每1.5秒轮询一次
    
    // 保存定时器引用
    pollingIntervalsRef.current.set(videoId, pollInterval);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">{error}</div>
        <button onClick={() => window.location.reload()}>重试</button>
      </div>
    );
  }

  return (
    <div className="video-list-container">
      {/* VideoUpload组件（隐藏的上传功能） */}
      <VideoUpload 
        ref={uploadRef} 
        onUploadSuccess={handleUploadSuccess}
      />
      
      {/* 视频网格 */}
      <div className="video-grid">
        {videos.length === 0 ? (
          <div className="empty-state">
            <p>暂无视频，快来上传第一个吧！</p>
          </div>
        ) : (
          videos.map((video) => {
            const isProcessing = processingTasks.has(video.video_id);
            const taskInfo = processingTasks.get(video.video_id);
            
            return (
              <div
                key={video.filename}
                className={`video-card ${isProcessing ? 'processing' : ''}`}
                onClick={() => !isProcessing && handleVideoClick(video.video_id)}
              >
                <div className="video-thumbnail-wrapper">
                  <video
                    className="video-thumbnail"
                    src={getVideoUrl(video.video_id)}
                    preload="metadata"
                    muted
                  />
                  {isProcessing && (
                    <div className="processing-overlay">
                      <div className="processing-spinner"></div>
                      <div className="processing-text">
                        正在提取骨骼数据...
                        <br />
                        <span className="processing-progress">{taskInfo?.progress || 0}%</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="video-info">
                  <h3 className="video-title">{video.title}</h3>
                  {video.author && (
                    <p className="video-author">👤 {video.author}</p>
                  )}
                  {video.description && (
                    <p className="video-description">{video.description}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default VideoList;
