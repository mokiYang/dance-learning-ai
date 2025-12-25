import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService, ReferenceVideo, getVideoUrl } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { VideoRecorder } from '../../utils/videoRecorder';
import './index.less';

const VideoPlayer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);

  const [video, setVideo] = useState<ReferenceVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // 倒计时相关状态
  const [countdown, setCountdown] = useState<number>(0);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [hasStartedCountdown, setHasStartedCountdown] = useState(false);
  
  // 新增状态：是否交换位置（摄像头在大屏）
  const [isSwapped, setIsSwapped] = useState(false);
  // 新增状态：摄像头朝向（user=前置，environment=后置）
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const videoRecorder = useRef<VideoRecorder>(new VideoRecorder());
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 根据ID获取视频数据
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
        
        const response = await apiService.getReferenceVideos();
        if (response.success) {
          // 根据video_id查找视频
          const foundVideo = response.videos.find(v => v.video_id === id);
          if (foundVideo) {
            setVideo(foundVideo);
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

  useEffect(() => {
    if (error && !loading) {
      navigate('/');
      return;
    }
  }, [error, loading, navigate]);

  // 清理倒计时和摄像头检查定时器
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (cameraCheckIntervalRef.current) {
        clearInterval(cameraCheckIntervalRef.current);
      }
    };
  }, []);

  // 管理摄像头流绑定
  useEffect(() => {
    if (cameraStream && cameraVideoRef.current && isCameraActive) {
      const video = cameraVideoRef.current;
      
      // 绑定流到 video 元素
      video.srcObject = cameraStream;
      
      const handleCanPlay = () => {
        setIsCameraReady(true);
      };
      
      video.addEventListener('canplay', handleCanPlay);
      
      video.play().catch(err => {
        console.warn('摄像头自动播放失败:', err);
        setIsCameraReady(true);
      });
      
      return () => {
        video.removeEventListener('canplay', handleCanPlay);
      };
    }
  }, [cameraStream, isCameraActive]);

  // 移除自动开始倒计时逻辑，改为手动点击开始录制按钮

  // 组件卸载时清理资源
  useEffect(() => {
    const streamToCleanup = cameraStream;
    const recorderToCleanup = videoRecorder.current;
    
    return () => {
      if (recorderToCleanup.isRecording()) {
        recorderToCleanup.cleanup();
      }
      
      if (streamToCleanup) {
        streamToCleanup.getTracks().forEach(track => track.stop());
      }
      
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const startCountdown = () => {
    setCountdown(3);
    setIsCountdownActive(true);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setIsCountdownActive(false);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          startRecordingAndPlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRecordingAndPlay = async () => {
    try {
      // 确保摄像头流存在
      if (!cameraStream) {
        throw new Error('摄像头流不存在');
      }
      
      // 确保摄像头视频元素存在
      if (!cameraVideoRef.current) {
        throw new Error('摄像头视频元素不存在');
      }
      
      // 确保清空之前的录制数据
      videoRecorder.current.cleanup();
      
      // 使用 Canvas 录制方案：从摄像头视频元素捕获画面
      await videoRecorder.current.startRecordingFromVideoElement(cameraVideoRef.current);
      setIsRecording(true);

      // 从头播放教学视频
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        await videoRef.current.play();
        setIsPlaying(true);
        
        // 监听视频结束事件
        const handleVideoEnd = () => {
          stopRecording();
          videoRef.current?.removeEventListener('ended', handleVideoEnd);
        };
        
        videoRef.current.addEventListener('ended', handleVideoEnd);
      }
    } catch (error) {
      console.error('开始录制失败:', error);
      alert('录制失败，请检查摄像头权限');
    }
  };

  const handleFollowLearning = async () => {
    if (!videoRef.current) {
      console.error('videoRef.current 不存在');
      return;
    }

    try {
      // 启动摄像头，使用视窗比例
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: window.innerWidth },
          height: { ideal: window.innerHeight },
          facingMode: facingMode
        },
        audio: false
      });

      setCameraStream(stream);
      setIsCameraActive(true);
      setIsCameraReady(false);

    } catch (error) {
      console.error('启动跟学模式失败:', error);
      alert('无法访问摄像头，请检查权限设置');
    }
  };

  // 手动点击开始录制按钮
  const handleStartRecordingClick = () => {
    if (isCameraReady && !hasStartedCountdown && !isRecording) {
      setHasStartedCountdown(true);
      startCountdown();
    }
  };

  // 切换摄像头前后置
  const handleSwitchCamera = async (e: React.MouseEvent) => {
    // 阻止事件冒泡，防止触发 handleSwapPosition
    e.stopPropagation();
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    console.log(`尝试切换到${newFacingMode === 'user' ? '前置' : '后置'}摄像头`);
    
    // 停止当前流
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        console.log('停止摄像头轨道:', track.label);
        track.stop();
      });
    }

    // 暂时设置摄像头未就绪，并重置倒计时状态
    setIsCameraReady(false);
    setHasStartedCountdown(false);

    try {
      // 尝试获取设备列表，检查是否有多个摄像头
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log(`检测到 ${videoDevices.length} 个摄像头:`, videoDevices.map(d => d.label));

      if (videoDevices.length < 2) {
        alert('您的设备只有一个摄像头，无法切换');
        // 恢复原来的摄像头
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight },
            facingMode: facingMode
          },
          audio: false
        });
        setCameraStream(stream);
        setIsCameraReady(true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: window.innerWidth },
          height: { ideal: window.innerHeight },
          facingMode: newFacingMode
        },
        audio: false
      });

      console.log('切换成功，新摄像头轨道:', stream.getVideoTracks()[0].label);
      console.log('摄像头设置:', stream.getVideoTracks()[0].getSettings());

      setCameraStream(stream);
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error('切换摄像头失败:', error);
      alert(`切换摄像头失败: ${error instanceof Error ? error.message : '未知错误'}`);
      
      // 恢复原来的摄像头
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: window.innerWidth },
            height: { ideal: window.innerHeight },
            facingMode: facingMode
          },
          audio: false
        });
        setCameraStream(stream);
        setIsCameraReady(true);
      } catch (e) {
        console.error('恢复摄像头失败:', e);
        alert('摄像头访问失败，请重新开启跟学模式');
        setIsCameraActive(false);
      }
    }
  };

  // 交换摄像头和视频位置
  const handleSwapPosition = () => {
    setIsSwapped(!isSwapped);
  };

  const stopRecording = async () => {
    try {
      console.log('开始停止录制...');
      
      const recordedBlob = await videoRecorder.current.stopRecording();
      console.log('录制停止成功，录制文件大小:', recordedBlob.size);
      
      setIsRecording(false);
      
      console.log('录制完成，跳转到结果页面');
      
      // 停止教学视频播放
      if (videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      
      // 停止摄像头
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
        setIsCameraActive(false);
      }
      
      // 将录制的视频数据传递到结果页面
      const videoUrl = URL.createObjectURL(recordedBlob);
      navigate(`/result/${id}`, { 
        state: { 
          recordedVideo: recordedBlob,
          recordedVideoUrl: videoUrl,
          videoInfo: {
            filename: `recorded_${Date.now()}.webm`,
            size: recordedBlob.size,
            type: recordedBlob.type
          }
        } 
      });
      
    } catch (error) {
      console.error('停止录制失败:', error);
    }
  };

  // 新增：暂停/继续录制
  const handlePauseRecording = () => {
    if (videoRef.current) {
      if (isPlaying) {
        // 暂停教学视频和录制
        videoRef.current.pause();
        setIsPlaying(false);
        videoRecorder.current.pauseRecording();
        console.log('手动暂停教学视频和录制');
      } else {
        // 继续播放教学视频和录制
        videoRef.current.play();
        setIsPlaying(true);
        videoRecorder.current.resumeRecording();
        console.log('手动继续教学视频和录制');
      }
    }
  };

  // 新增：手动停止录制
  const handleStopRecording = () => {
    console.log('手动停止录制');
    stopRecording();
  };

  const handleBackToList = () => {
    // 停止录制
    if (isRecording) {
      videoRecorder.current.cleanup();
    }
    
    // 停止摄像头
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    // 清理倒计时
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    navigate('/');
  };

  const handleReplay = () => {
    setCountdown(0);
    setIsCountdownActive(false);
    setHasStartedCountdown(false);
    setIsCameraActive(false);
    setIsCameraReady(false);
    setIsRecording(false);
    setIsSwapped(false);
    
    // 清理录制器，清空之前的录制数据
    videoRecorder.current.cleanup();
    
    // 停止摄像头
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  if (loading) {
    return (
      <div className="video-player-container">
        <div className="loading-container">
          <div className="loading-spinner">加载中...</div>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="video-player-container">
        <div className="error-container">
          <div className="error-message">视频不存在</div>
          <button className="btn btn-primary" onClick={handleBackToList}>
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="video-player-container">
      <div className="controls">
        <button className="btn-back" onClick={handleBackToList}>
          ←
        </button>
        
        <div className="controls-right">
          {isAuthenticated ? (
            <button 
              className="btn-action btn-success" 
              onClick={handleFollowLearning}
              disabled={isCameraActive}
            >
              录同款
            </button>
          ) : (
            <button 
              className="btn-login-required" 
              onClick={() => navigate('/profile')}
            >
              登录后可录同款
            </button>
          )}
          
          {/* 摄像头就绪后显示开始录制按钮 */}
          {isCameraActive && isCameraReady && !isRecording && !hasStartedCountdown && (
            <button 
              className="btn-action btn-record-start" 
              onClick={handleStartRecordingClick}
            >
              开始录制
            </button>
          )}
          
          {/* 录制控制按钮 */}
          {isRecording && (
            <>
              <button 
                className="btn-action btn-warning" 
                onClick={handlePauseRecording}
                disabled={!isRecording}
              >
                {isPlaying ? '暂停' : '继续'}
              </button>
              <button 
                className="btn-action btn-danger" 
                onClick={handleStopRecording}
                disabled={!isRecording}
              >
                结束
              </button>
            </>
          )}
        </div>
      </div>

      <div className="video-layout">
        {/* 教学视频 - ref 始终绑定 */}
        <div 
          className={`video-wrapper ${isCameraActive ? (isSwapped ? 'as-overlay' : 'as-main') : 'as-main'}`}
          onClick={isCameraActive && isSwapped ? handleSwapPosition : undefined}
        >
          <video
            ref={videoRef}
            className="video-element"
            src={getVideoUrl(video.video_id)}
            controls={!isSwapped || !isCameraActive}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </div>

        {/* 摄像头视频 - ref 始终绑定 */}
        {isCameraActive && (
          <div 
            className={`video-wrapper ${isSwapped ? 'as-main' : 'as-overlay'}`}
            onClick={handleSwapPosition}
          >
            <video
              ref={cameraVideoRef}
              className="video-element"
              autoPlay
              muted
              playsInline
            />
            {/* 切换前后置摄像头按钮 - 只在摄像头全屏时显示 */}
            {isSwapped && (
              <button 
                className="btn-switch-camera"
                onClick={handleSwitchCamera}
                disabled={isRecording}
                title={facingMode === 'user' ? '切换到后置' : '切换到前置'}
              >
                <svg viewBox="0 0 1024 1024" width="28" height="28" fill="currentColor">
                  <path d="M719.127273 193.163636c-2.327273 2.327273-4.654545 4.654545-6.981818 4.654546l-134.981819 55.854545c-11.636364 6.981818-25.6 0-32.581818-11.636363-6.981818-11.636364 0-25.6 11.636364-32.581819l111.709091-44.218181-67.490909-111.709091c-6.981818-11.636364 0-25.6 11.636363-32.581818 11.636364-6.981818 25.6 0 32.581818 11.636363L721.454545 165.236364c2.327273 4.654545 2.327273 11.636364 2.327273 18.618181-2.327273 2.327273-2.327273 4.654545-4.654545 9.309091zM309.527273 812.218182c2.327273-2.327273 4.654545-4.654545 6.981818-4.654546l134.981818-55.854545c11.636364-6.981818 25.6 0 32.581818 11.636364 6.981818 11.636364 0 25.6-11.636363 32.581818L358.4 837.818182l67.490909 111.709091c6.981818 11.636364 0 25.6-11.636364 32.581818-11.636364 6.981818-25.6 0-32.581818-11.636364L304.872727 837.818182c-2.327273-4.654545-2.327273-11.636364-2.327272-18.618182l6.981818-6.981818z"/>
                  <path d="M209.454545 742.4c-6.981818 0-13.963636-2.327273-18.618181-9.309091C72.145455 581.818182 79.127273 370.036364 209.454545 225.745455c128-141.963636 339.781818-172.218182 502.69091-72.145455 9.309091 9.309091 11.636364 23.272727 4.654545 34.909091s-20.945455 13.963636-32.581818 6.981818c-144.290909-88.436364-330.472727-62.836364-442.181818 62.836364-114.036364 125.672727-121.018182 314.181818-16.290909 446.836363 6.981818 9.309091 6.981818 25.6-4.654546 32.581819-2.327273 2.327273-6.981818 4.654545-11.636364 4.654545zM523.636364 907.636364c-69.818182 0-139.636364-18.618182-202.472728-55.854546-11.636364-6.981818-13.963636-20.945455-6.981818-32.581818 6.981818-11.636364 20.945455-13.963636 32.581818-6.981818 141.963636 86.109091 328.145455 58.181818 437.527273-65.163637 111.709091-123.345455 118.690909-309.527273 18.618182-442.181818-6.981818-9.309091-4.654545-25.6 4.654545-32.581818 9.309091-6.981818 25.6-4.654545 32.581819 4.654546 114.036364 151.272727 104.727273 360.727273-20.945455 502.690909-79.127273 83.781818-186.181818 128-295.563636 128z"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 全屏倒计时覆盖层 */}
        {isCountdownActive && (
          <div className="fullscreen-countdown-overlay">
            <div className="fullscreen-countdown-number">{countdown}</div>
          </div>
        )}
      </div>

    </div>
  );
};

export default VideoPlayer;