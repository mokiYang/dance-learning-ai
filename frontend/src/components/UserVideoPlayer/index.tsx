import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { apiService, getVideoUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import BaseVideoPlayer, { ControlButton } from '../BaseVideoPlayer';
import CommentModal from '../CommentModal';
import './index.less';

interface UserVideo {
  video_id: string;
  filename: string;
  file_path: string;
  duration: number;
  fps: number;
  upload_time: string;
}

const UserVideoPlayer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<UserVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!id) {
        setError('视频ID不能为空');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await apiService.getUserVideos();
        if (response.success) {
          const foundVideo = response.videos.find((v: any) => v.video_id === id);
          if (foundVideo) {
            setVideo(foundVideo);
            // 获取评论数量
            const commentsResponse = await apiService.getComments(id, 'user');
            if (commentsResponse.success) {
              setCommentCount(commentsResponse.comments?.length || 0);
            }
          } else {
            setError('未找到指定的视频');
          }
        } else {
          setError('获取视频数据失败');
        }
      } catch (err) {
        setError('网络错误，请稍后重试');
        console.error('获取视频数据失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  const handleBackToList = () => {
    // 返回时带上 tab 参数，用户视频默认返回 user tab
    const tab = searchParams.get('tab') || 'user';
    navigate(`/?tab=${tab}`);
  };

  const handleShowComments = () => {
    setShowCommentModal(true);
  };

  const handleCommentSubmit = async () => {
    // 刷新评论数量
    if (id) {
      const commentsResponse = await apiService.getComments(id, 'user');
      if (commentsResponse.success) {
        setCommentCount(commentsResponse.comments?.length || 0);
      }
    }
  };

  // 构建右侧按钮（评论按钮）
  const rightButtons: ControlButton[] = [
    {
      label: (
        <>
          <span className="comment-icon">💬</span>
          <span className="comment-text">评论</span>
          {commentCount > 0 && (
            <span className="comment-count">{commentCount}</span>
          )}
        </>
      ),
      className: 'btn-comment',
      onClick: handleShowComments,
      disabled: !isAuthenticated,
    },
  ];

  // 自定义视频元素
  const customVideo = (
    <div className="video-wrapper as-main">
      <video
        ref={videoRef}
        className="video-element"
        src={video ? getVideoUrl(video.video_id, 'user') : undefined}
        controls
        playsInline
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );

  return (
    <>
      <BaseVideoPlayer
        onBack={handleBackToList}
        rightButtons={rightButtons}
        loading={loading}
        error={error || (!video ? '视频不存在' : null)}
        customVideo={customVideo}
      />

      {showCommentModal && (
        <CommentModal
          videoId={id!}
          videoType="user"
          onClose={() => setShowCommentModal(false)}
          onCommentSubmit={handleCommentSubmit}
        />
      )}
    </>
  );
};

export default UserVideoPlayer;

