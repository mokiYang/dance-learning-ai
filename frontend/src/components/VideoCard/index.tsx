import React, { useState, useEffect } from 'react';
import { getVideoUrl, getThumbnailUrl, apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import './index.less';

export interface VideoCardProps {
  videoId: string;
  videoType?: 'reference' | 'user';
  title: string;
  author?: string;
  thumbnailPath?: string;
  onClick: () => void;
  isProcessing?: boolean;
  processingProgress?: number;
  className?: string;
  initialLikeCount?: number;
  initialIsLiked?: boolean;
}

const VideoCard: React.FC<VideoCardProps> = ({
  videoId,
  videoType = 'reference',
  title,
  author,
  thumbnailPath,
  onClick,
  isProcessing = false,
  processingProgress = 0,
  className = '',
  initialLikeCount = 0,
  initialIsLiked = false,
}) => {
  const { isAuthenticated } = useAuth();
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [isLiking, setIsLiking] = useState(false);

  const thumbnailUrl = thumbnailPath ? getThumbnailUrl(videoId) : undefined;
  const videoUrl = getVideoUrl(videoId, videoType);

  // 加载点赞信息
  useEffect(() => {
    const loadLikeInfo = async () => {
      try {
        const result = await apiService.getLikeInfo(videoId, videoType);
        if (result.success) {
          setLikeCount(result.like_count || 0);
          setIsLiked(result.is_liked || false);
        }
      } catch (error) {
        console.error('加载点赞信息失败:', error);
      }
    };
    loadLikeInfo();
  }, [videoId, videoType]);

  // 处理点赞点击
  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发卡片点击
    e.preventDefault(); // 阻止默认行为，避免按钮获得焦点时卡片变蓝

    if (!isAuthenticated) {
      // 可以显示提示，需要登录才能点赞
      return;
    }

    if (isLiking) return; // 防止重复点击

    setIsLiking(true);
    try {
      const result = await apiService.toggleLike(videoId, videoType);
      if (result.success) {
        setIsLiked(result.is_liked || false);
        setLikeCount(result.like_count || 0);
      }
    } catch (error) {
      console.error('点赞操作失败:', error);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div
      className={`video-card ${isProcessing ? 'processing' : ''} ${className}`}
      onClick={() => !isProcessing && onClick()}
    >
      <div className="video-thumbnail-wrapper">
        {thumbnailUrl ? (
          <img
            className="video-thumbnail"
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
          />
        ) : (
          <video
            className="video-thumbnail"
            src={videoUrl}
            preload="metadata"
            muted
            playsInline
          />
        )}
        {isProcessing && (
          <div className="processing-overlay">
            <div className="processing-spinner"></div>
            <div className="processing-text">
              正在提取骨骼数据...
              <br />
              <span className="processing-progress">{processingProgress}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="video-info">
        <h3 className="video-title">{title}</h3>
        <div className="video-footer">
          {author && (
            <span className="video-author">
              <span className="author-icon">👤</span>
              {author}
            </span>
          )}
          <button
            className={`video-like-button ${isLiked ? 'liked' : ''}`}
            onClick={handleLikeClick}
            disabled={!isAuthenticated || isLiking}
            title={isAuthenticated ? (isLiked ? '取消点赞' : '点赞') : '登录后可以点赞'}
          >
            <span className="like-icon">{isLiked ? '❤️' : '🤍'}</span>
            <span className="like-count">{likeCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;

