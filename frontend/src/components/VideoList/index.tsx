import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiService, ReferenceVideo } from "../../services/api";
import VideoUpload from "../VideoUpload";
import "./index.less";

const VideoList: React.FC = () => {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<ReferenceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 使用ref来跟踪请求状态和缓存
  const requestRef = useRef<Promise<any> | null>(null);
  const cacheRef = useRef<{ data: ReferenceVideo[]; timestamp: number } | null>(
    null
  );
  const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
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
        const result = await requestRef.current;
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

  const handleUploadSuccess = () => {
    // 上传成功后清除缓存并重新加载视频列表
    cacheRef.current = null;
    fetchVideos();
  };

  const handleUploadError = (errorMsg: string) => {
    // 可以在这里处理上传错误，比如显示全局错误提示
    console.error("上传错误:", errorMsg);
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
      <div className="header-section">
        <h2>舞蹈教学视频</h2>
        <VideoUpload
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
        />
      </div>

      <div className="video-grid">
        {videos.map((video) => (
          <div
            key={video.filename}
            className="video-card"
            onClick={() => handleVideoClick(video.video_id)}
          >
            <video
              className="video-thumbnail"
              src={`http://localhost:8128/video/${video.video_id}`}
              preload="metadata"
              muted
            />
            <div className="video-info">
              <h3 className="video-title">{video.title}</h3>
              {video.author && (
                <p className="video-author">作者: {video.author}</p>
              )}
              {video.description && (
                <p className="video-description">{video.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {videos.length === 0 && !loading && (
        <div className="empty-state" onClick={() => navigate("/upload")}>
          <p>暂无教学视频，请上传第一个视频开始使用</p>
        </div>
      )}
    </div>
  );
};

export default VideoList;
