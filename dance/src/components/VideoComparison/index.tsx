import React, { useState, useRef, useEffect } from 'react';
import { apiService, FrameComparisonResult, FrameComparison } from '../../services/api';
import './index.less';

interface VideoComparisonProps {
  workId: string;
  onClose: () => void;
}

const VideoComparison: React.FC<VideoComparisonProps> = ({ workId, onClose }) => {
  const [frameData, setFrameData] = useState<FrameComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoLoading, setVideoLoading] = useState(true);
  
  const referenceVideoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 获取逐帧对比数据
  useEffect(() => {
    const fetchFrameData = async () => {
      try {
        setLoading(true);
        const result = await apiService.getFrameComparison(workId);
        if (result.success) {
          setFrameData(result);
        } else {
          setError('获取对比数据失败');
        }
      } catch (err) {
        setError('获取对比数据失败');
        console.error('获取对比数据失败:', err);
      } finally {
        setLoading(false);
        setVideoLoading(false);
      }
    };

    fetchFrameData();
  }, [workId]);

  // 同步视频播放
  useEffect(() => {
    const referenceVideo = referenceVideoRef.current;
    const userVideo = userVideoRef.current;
    
    if (!referenceVideo || !userVideo || !frameData) return;

    const syncVideos = () => {
      if (referenceVideo.currentTime !== userVideo.currentTime) {
        userVideo.currentTime = referenceVideo.currentTime;
      }
    };

    referenceVideo.addEventListener('timeupdate', syncVideos);
    return () => {
      referenceVideo.removeEventListener('timeupdate', syncVideos);
    };
  }, [frameData]);

  // 播放/暂停控制
  const togglePlay = () => {
    const referenceVideo = referenceVideoRef.current;
    const userVideo = userVideoRef.current;
    
    if (!referenceVideo || !userVideo) return;

    if (isPlaying) {
      referenceVideo.pause();
      userVideo.pause();
    } else {
      referenceVideo.play();
      userVideo.play();
    }
    setIsPlaying(!isPlaying);
  };

  // 跳转到指定帧
  const jumpToFrame = (frameIndex: number) => {
    if (!frameData) return;
    
    const frame = frameData.frame_comparisons[frameIndex];
    if (!frame) return;

    const referenceVideo = referenceVideoRef.current;
    const userVideo = userVideoRef.current;
    
    if (referenceVideo && userVideo) {
      referenceVideo.currentTime = frame.timestamp;
      userVideo.currentTime = frame.timestamp;
      setCurrentFrame(frameIndex);
    }
  };

  // 设置播放速度
  const setSpeed = (speed: number) => {
    const referenceVideo = referenceVideoRef.current;
    const userVideo = userVideoRef.current;
    
    if (referenceVideo && userVideo) {
      referenceVideo.playbackRate = speed;
      userVideo.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  if (loading) {
    return (
      <div className="video-comparison">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (error || !frameData) {
    return (
      <div className="video-comparison">
        <div className="error">{error || '数据加载失败'}</div>
        <button onClick={onClose} className="close-btn">关闭</button>
      </div>
    );
  }

  return (
    <div className="video-comparison">
      <div className="comparison-header">
        <h3>视频对比分析</h3>
        <button onClick={onClose} className="close-btn">关闭</button>
      </div>

      <div className="video-container">
        <div className="video-panel">
          <div className="video-label">参考视频</div>
          <video
            ref={referenceVideoRef}
            src={apiService.getPoseVideoUrl(workId, 'reference')}
            controls
            className="comparison-video"
          />
        </div>
        
        <div className="video-panel">
          <div className="video-label">用户视频</div>
          <video
            ref={userVideoRef}
            src={apiService.getPoseVideoUrl(workId, 'user')}
            controls
            className="comparison-video"
          />
        </div>
      </div>

      <div className="controls">
        <div className="playback-controls">
          <button onClick={togglePlay} className="play-btn">
            {isPlaying ? '暂停' : '播放'}
          </button>
          
          <div className="speed-controls">
            <span>播放速度:</span>
            {[0.5, 1, 1.5, 2].map(speed => (
              <button
                key={speed}
                onClick={() => setSpeed(speed)}
                className={playbackSpeed === speed ? 'active' : ''}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="timeline-container">
        <div className="timeline-header">
          <span>时间轴对比</span>
          <span>差异阈值: {frameData.threshold}</span>
        </div>
        
        <div className="timeline" ref={timelineRef}>
          {frameData.frame_comparisons.map((frame, index) => (
            <div
              key={index}
              className={`timeline-frame ${frame.has_difference ? 'has-difference' : ''} ${!frame.has_pose_data ? 'no-pose-data' : ''} ${index === currentFrame ? 'current' : ''}`}
              onClick={() => jumpToFrame(index)}
              title={`帧 ${frame.frame_index}: ${frame.has_pose_data ? `差异值 ${frame.difference.toFixed(3)}` : '无骨骼数据'}`}
            >
              <div className="frame-number">{frame.frame_index}</div>
              <div className="frame-time">{frame.timestamp.toFixed(1)}s</div>
              {frame.has_pose_data ? (
                frame.has_difference && (
                  <div className="difference-indicator">
                    {frame.difference.toFixed(2)}
                  </div>
                )
              ) : (
                <div className="no-pose-indicator">
                  无数据
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="comparison-stats">
        <div className="stat-item">
          <span>总帧数:</span>
          <span>{frameData.frame_comparisons.length}</span>
        </div>
        <div className="stat-item">
          <span>有效对比帧数:</span>
          <span>{frameData.frame_comparisons.filter(f => f.has_pose_data).length}</span>
        </div>
        <div className="stat-item">
          <span>差异帧数:</span>
          <span>{frameData.frame_comparisons.filter(f => f.has_difference).length}</span>
        </div>
        <div className="stat-item">
          <span>同步率:</span>
          <span>
            {(() => {
              const validFrames = frameData.frame_comparisons.filter(f => f.has_pose_data);
              if (validFrames.length === 0) return '0%';
              const syncFrames = validFrames.filter(f => !f.has_difference).length;
              return ((syncFrames / validFrames.length) * 100).toFixed(1) + '%';
            })()}
          </span>
        </div>
        <div className="stat-item">
          <span>对比时长:</span>
          <span>
            {frameData.frame_comparisons.length > 0 
              ? `${Math.max(...frameData.frame_comparisons.map(f => f.timestamp)).toFixed(1)}秒`
              : '0秒'
            }
          </span>
        </div>
      </div>
    </div>
  );
};

export default VideoComparison;