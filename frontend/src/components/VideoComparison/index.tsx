import React, { useState, useRef, useEffect } from 'react';
import { apiService, FrameComparisonResult, getVideoUrl } from '../../services/api';
import { showToast } from '../Toast/ToastContainer';
import UploadFormModal from '../UploadFormModal';
import PoseCanvas from '../PoseCanvas';
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
  const [userVideoError, setUserVideoError] = useState<string | null>(null);
  const [referenceVideoError, setReferenceVideoError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [userVideoLoaded, setUserVideoLoaded] = useState(false);
  const [referenceVideoLoaded, setReferenceVideoLoaded] = useState(false);
  
  const referenceVideoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  // 骨骼叠加层显隐
  const [showPose, setShowPose] = useState(true);

  // 使用原始视频 URL（不再使用生成的骨骼视频，改用 Canvas 实时绘制）
  const referenceVideoId = frameData?.video_info?.reference?.video_id;
  const userVideoId = frameData?.video_info?.user?.video_id;
  const referenceFps = frameData?.video_info?.reference?.fps || 30;
  const userFps = frameData?.video_info?.user?.fps || 30;

  const referenceVideoUrl = React.useMemo(
    () => (referenceVideoId ? getVideoUrl(referenceVideoId, 'reference') : ''),
    [referenceVideoId]
  );
  const userVideoUrl = React.useMemo(
    () => (userVideoId ? getVideoUrl(userVideoId, 'user') : ''),
    [userVideoId]
  );

  // 获取逐帧对比数据
  useEffect(() => {
    const fetchFrameData = async () => {
      try {
        setLoading(true);
        setVideoLoading(true);
        setUserVideoLoaded(false);
        setReferenceVideoLoaded(false);
        setRetryCount(0);
        setUserVideoError(null);
        setReferenceVideoError(null);
        const result = await apiService.getFrameComparison(workId);
        if (result.success) {
          setFrameData(result);
          // 数据加载完成后，允许视频元素渲染
          setLoading(false);
          setVideoLoading(false);
        } else {
          setError('获取对比数据失败');
          setLoading(false);
          setVideoLoading(false);
        }
      } catch (err) {
        setError('获取对比数据失败');
        console.error('获取对比数据失败:', err);
        setLoading(false);
        setVideoLoading(false);
      }
    };

    fetchFrameData();
  }, [workId]);

  // 同步视频播放（优化版本，避免干扰正常播放）
  useEffect(() => {
    const referenceVideo = referenceVideoRef.current;
    const userVideo = userVideoRef.current;
    
    if (!referenceVideo || !userVideo || !frameData) return;

    let isSyncing = false; // 防止递归同步
    let lastSyncTime = 0;
    const SYNC_THRESHOLD = 0.2; // 时间差阈值（秒），超过这个值才同步
    const SYNC_INTERVAL = 200; // 同步间隔（毫秒），避免过于频繁

    const syncVideos = () => {
      // 防止过于频繁的同步
      const now = Date.now();
      if (now - lastSyncTime < SYNC_INTERVAL || isSyncing) {
        return;
      }
      lastSyncTime = now;

      const timeDiff = Math.abs(referenceVideo.currentTime - userVideo.currentTime);
      
      // 只有当时间差超过阈值时才同步
      // 播放时使用更宽松的阈值，避免频繁干扰
      const threshold = referenceVideo.paused ? SYNC_THRESHOLD : SYNC_THRESHOLD * 2;
      
      if (timeDiff > threshold) {
        isSyncing = true;
        // 使用 requestAnimationFrame 来平滑同步，避免直接设置导致跳跃
        requestAnimationFrame(() => {
          if (userVideo && referenceVideo) {
            userVideo.currentTime = referenceVideo.currentTime;
          }
          isSyncing = false;
        });
      }
    };

    // 使用 seeked 事件在跳转后同步，而不是 timeupdate（更精确且不干扰播放）
    const handleSeeked = () => {
      if (!isSyncing && referenceVideo && userVideo) {
        const timeDiff = Math.abs(referenceVideo.currentTime - userVideo.currentTime);
        if (timeDiff > 0.1) {
          isSyncing = true;
          userVideo.currentTime = referenceVideo.currentTime;
          setTimeout(() => { isSyncing = false; }, 100);
        }
      }
    };

    // 监听跳转事件（更精确）
    referenceVideo.addEventListener('seeked', handleSeeked);
    
    // 仍然监听 timeupdate，但使用更宽松的条件
    referenceVideo.addEventListener('timeupdate', syncVideos);
    
    return () => {
      referenceVideo.removeEventListener('seeked', handleSeeked);
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
      // 播放前先同步时间
      const currentTime = referenceVideo.currentTime;
      userVideo.currentTime = currentTime;
      
      // 确保播放速度一致
      userVideo.playbackRate = referenceVideo.playbackRate;
      
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
      // 先同步时间，再设置播放速度
      const currentTime = referenceVideo.currentTime;
      userVideo.currentTime = currentTime;
      
      // 设置播放速度
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

  const handleUploadClick = () => {
    setShowUploadForm(true);
    setVideoTitle('');
  };

  const handleUploadCancel = () => {
    setShowUploadForm(false);
    setVideoTitle('');
  };

  const handleUploadSubmit = async () => {
    if (!videoTitle.trim()) {
      showToast('请输入视频标题', 'error');
      return;
    }

    setUploading(true);
    try {
      const response = await apiService.uploadUserVideoFromWork(workId, videoTitle.trim());
      
      if (response.success) {
        showToast('用户视频上传成功！视频已保存到您的视频列表', 'success', 3000);
        setShowUploadForm(false);
        setVideoTitle('');
      } else {
        showToast(`上传失败: 未知错误`, 'error');
      }
    } catch (err: any) {
      console.error('上传失败:', err);
      showToast(`上传失败: ${err.message || '网络错误'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="video-comparison">
      {/* 上传表单弹窗 */}
      <UploadFormModal
        visible={showUploadForm}
        title="投稿"
        onClose={handleUploadCancel}
        showOverlay={true}
      >
        <div className="form-group">
          <label htmlFor="video-title">视频标题 *</label>
          <input
            id="video-title"
            type="text"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            placeholder="请输入视频标题"
            required
            autoFocus
          />
        </div>
        
        <div className="form-actions">
          <button
            className="cancel-button"
            onClick={handleUploadCancel}
            disabled={uploading}
          >
            取消
          </button>
          <button
            className="submit-button"
            onClick={handleUploadSubmit}
            disabled={uploading || !videoTitle.trim()}
          >
            {uploading ? (
              <>
                <span className="upload-icon">⏳</span>
                上传中...
              </>
            ) : (
              <>
                <span className="upload-icon">📤</span>
                确认上传
              </>
            )}
          </button>
        </div>
      </UploadFormModal>

      <div className="comparison-header">
        <h3>视频对比分析</h3>
        <div className="header-actions">
          <button 
            onClick={handleUploadClick} 
            className="upload-user-video-btn"
          >
            投稿
          </button>
          <button onClick={onClose} className="close-btn">关闭</button>
        </div>
      </div>

      <div className="video-container">
        <div className="video-panel">
          {referenceVideoError ? (
            <div className="video-error">
              <div className="error-message">{referenceVideoError}</div>
              <button 
                className="retry-btn" 
                onClick={() => {
                  setReferenceVideoError(null);
                  setReferenceVideoLoaded(false);
                  if (referenceVideoRef.current) {
                    referenceVideoRef.current.load();
                  }
                }}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="video-with-overlay">
              <video
                ref={referenceVideoRef}
                src={referenceVideoUrl}
                className="comparison-video"
                controls={false}
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => {
                  if (!referenceVideoLoaded) {
                    console.log('参考视频加载完成');
                    setReferenceVideoError(null);
                    setReferenceVideoLoaded(true);
                  }
                }}
                onError={(e) => {
                  const video = e.currentTarget;
                  let errorMsg = '未知错误';
                  
                  if (video.error) {
                    const errorCode = video.error.code;
                    const errorMessages: { [key: number]: string } = {
                      1: '视频加载被中止',
                      2: '网络错误导致视频加载失败',
                      3: '视频解码失败',
                      4: '视频格式不支持或视频源无效'
                    };
                    errorMsg = errorMessages[errorCode] || `错误代码: ${errorCode}`;
                    if (video.error.message) {
                      errorMsg += `, 消息: ${video.error.message}`;
                    }
                  }
                  
                  console.error('参考视频加载失败:', {
                    error: e,
                    videoError: video.error,
                    src: video.src,
                    networkState: video.networkState,
                    readyState: video.readyState
                  });
                  
                  setReferenceVideoError(`参考视频加载失败: ${errorMsg}。`);
                  setError(`参考视频加载失败: ${errorMsg}。请检查视频文件是否存在且格式正确，或联系管理员。`);
                }}
              />
              {referenceVideoId && (
                <PoseCanvas
                  videoRef={referenceVideoRef}
                  videoId={referenceVideoId}
                  fps={referenceFps}
                  enabled={showPose}
                />
              )}
            </div>
          )}
        </div>
        
        <div className="video-panel">
          {userVideoError ? (
            <div className="video-error">
              <div className="error-message">{userVideoError}</div>
              <button 
                className="retry-btn" 
                onClick={() => {
                  setUserVideoError(null);
                  setUserVideoLoaded(false);
                  if (userVideoRef.current) {
                    userVideoRef.current.load();
                  }
                }}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="video-with-overlay">
              <video
                ref={userVideoRef}
                src={userVideoUrl}
                className="comparison-video"
                controls={false}
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => {
                  if (!userVideoLoaded) {
                    console.log('用户视频加载完成');
                    setVideoLoading(false);
                    setUserVideoLoaded(true);
                    setUserVideoError(null);
                    setRetryCount(0);
                  }
                }}
                onError={(e) => {
                  const video = e.currentTarget;
                  let errorMsg = '未知错误';
                  
                  if (video.error) {
                    const errorCode = video.error.code;
                    const errorMessages: { [key: number]: string } = {
                      1: '视频加载被中止',
                      2: '网络错误导致视频加载失败',
                      3: '视频解码失败',
                      4: '视频格式不支持或视频源无效'
                    };
                    errorMsg = errorMessages[errorCode] || `错误代码: ${errorCode}`;
                    if (video.error.message) {
                      errorMsg += `, 消息: ${video.error.message}`;
                    }
                  }
                  
                  console.error('用户视频加载失败:', {
                    error: e,
                    videoError: video.error,
                    src: video.src,
                    networkState: video.networkState,
                    readyState: video.readyState
                  });
                  
                  setUserVideoError(`用户视频加载失败: ${errorMsg}。`);
                  
                  // 如果是格式不支持错误，尝试重新加载（最多重试1次，避免过多请求）
                  if (video.error?.code === 4 && retryCount < 1 && !userVideoLoaded) {
                    setTimeout(() => {
                      console.log(`重试加载用户视频 (${retryCount + 1}/1)...`);
                      setRetryCount(retryCount + 1);
                      if (userVideoRef.current) {
                        userVideoRef.current.load();
                      }
                    }, 3000);
                  } else {
                    setError(`用户视频加载失败: ${errorMsg}。请检查视频文件是否存在且格式正确，或联系管理员。`);
                  }
                }}
              />
              {userVideoId && (
                <PoseCanvas
                  videoRef={userVideoRef}
                  videoId={userVideoId}
                  fps={userFps}
                  enabled={showPose}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="video-compare-controls">
        <div className="playback-controls">
          <button onClick={togglePlay} className="play-btn">
            {isPlaying ? '暂停' : '播放'}
          </button>

          <button
            onClick={() => setShowPose(v => !v)}
            className={`pose-toggle-btn ${showPose ? 'active' : ''}`}
          >
            {showPose ? '隐藏骨骼' : '显示骨骼'}
          </button>
          
          <div className="speed-controls">
            <span>播放速度:</span>
            {[0.5, 0.75, 1].map(speed => (
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
              className={`timeline-frame ${frame.has_difference ? 'has-difference' : ''} ${!frame.has_pose_data ? 'no-pose-data' : ''} ${frame.pose_quality_issue ? 'pose-quality-issue' : ''} ${index === currentFrame ? 'current' : ''}`}
              onClick={() => jumpToFrame(index)}
              title={`帧 ${frame.frame_index}: ${
                !frame.has_pose_data 
                  ? '无骨骼数据' 
                  : frame.pose_quality_issue 
                    ? '骨骼提取质量差' 
                    : `差异值 ${frame.difference.toFixed(3)}`
              }`}
            >
              <div className="frame-number">{frame.frame_index}</div>
              <div className="frame-time">{frame.timestamp.toFixed(1)}s</div>
              {!frame.has_pose_data ? (
                <div className="no-pose-indicator">
                  无数据
                </div>
              ) : frame.pose_quality_issue ? (
                <div className="quality-issue-indicator">
                  质量差
                </div>
              ) : frame.has_difference ? (
                <div className="difference-indicator">
                  {frame.difference.toFixed(2)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="comparison-stats">
        <table className="stats-table">
          <tbody>
            <tr>
              <td className="stat-label">总帧数:</td>
              <td className="stat-value">{frameData.frame_comparisons.length}</td>
              <td className="stat-label">差异帧数:</td>
              <td className="stat-value">{frameData.frame_comparisons.filter(f => f.has_difference).length}</td>
            </tr>
            <tr>
              <td className="stat-label">同步率:</td>
              <td className="stat-value">
                {(() => {
                  const validFrames = frameData.frame_comparisons.filter(f => f.has_pose_data && !f.pose_quality_issue);
                  if (validFrames.length === 0) return '0%';
                  const syncFrames = validFrames.filter(f => !f.has_difference).length;
                  return ((syncFrames / validFrames.length) * 100).toFixed(1) + '%';
                })()}
              </td>
              <td className="stat-label">数据质量:</td>
              <td className="stat-value">
                {(() => {
                  const totalFrames = frameData.frame_comparisons.length;
                  const qualityFrames = frameData.frame_comparisons.filter(f => f.has_pose_data && !f.pose_quality_issue).length;
                  return totalFrames > 0 ? ((qualityFrames / totalFrames) * 100).toFixed(1) + '%' : '0%';
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VideoComparison;