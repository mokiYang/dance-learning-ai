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
  onDeleted?: () => void;
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
  onDeleted,
}) => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [isLiking, setIsLiking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    e.stopPropagation();
    e.preventDefault();

    if (!isAuthenticated) {
      return;
    }

    if (isLiking) return;

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

  // 管理员删除视频
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    setIsDeleting(true);
    try {
      const result = await apiService.adminDeleteVideo(videoId, videoType);
      if (result.success) {
        onDeleted?.();
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除视频失败:', error);
      alert('删除视频失败，请稍后重试');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteConfirm(false);
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
        {/* 管理员删除按钮 */}
        {isAdmin && !isProcessing && (
          <button
            className="admin-delete-btn"
            onClick={handleDeleteClick}
            title="管理员删除视频"
          >
            ✕
          </button>
        )}
        {/* 删除确认弹窗 */}
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay" onClick={handleCancelDelete}>
            <div className="delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <p>确定要删除这个视频吗？</p>
              <p className="delete-confirm-hint">此操作不可恢复</p>
              <div className="delete-confirm-actions">
                <button
                  className="delete-confirm-cancel"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                >
                  取消
                </button>
                <button
                  className="delete-confirm-ok"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? '删除中...' : '确定删除'}
                </button>
              </div>
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

