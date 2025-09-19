import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService, ReferenceVideo } from '../../services/api';
import { VideoRecorder } from '../../utils/videoRecorder';
import './index.less';

const VideoPlayer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      
      // 清除之前的事件监听器
      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onplay = null;
        video.onerror = null;
      };
      
      // 设置事件监听器
      video.onloadedmetadata = () => {
        console.log('摄像头视频元数据已加载');
      };
      
      video.onloadeddata = () => {
        console.log('摄像头视频数据已加载');
      };
      
      video.oncanplay = () => {
        console.log('摄像头视频可以播放，设置 isCameraReady = true');
        setIsCameraReady(true);
      };
      
      video.onplay = () => {
        console.log('摄像头视频开始播放');
      };
      
      video.onerror = (e) => {
        console.error('摄像头视频播放错误:', e);
        setIsCameraReady(false);
      };
      
      // 绑定流并尝试播放
      const bindStream = async () => {
        try {
          console.log('绑定摄像头流到视频元素');
          video.srcObject = cameraStream;
          
          // 确保视频元素加载并播放
          await video.load();
          console.log('尝试播放摄像头视频');
          await video.play();
          console.log('摄像头视频播放成功');
        } catch (err) {
          console.warn('摄像头自动播放失败，但标记为准备好:', err);
          setIsCameraReady(true);
        }
      };
      
      bindStream();
      
      // 清理函数
      return cleanup;
    }
  }, [cameraStream, isCameraActive]);

  // 摄像头准备就绪后自动开始倒计时（只触发一次）
  useEffect(() => {
    if (isCameraReady && !hasStartedCountdown && !isRecording) {
      console.log('摄像头准备就绪，开始倒计时');
      setHasStartedCountdown(true);
      startCountdown();
    }
  }, [isCameraReady, hasStartedCountdown, isRecording]);

  // 确保录制期间摄像头继续显示
  useEffect(() => {
    if (isRecording && cameraVideoRef.current && cameraStream) {
      console.log('录制期间，确保摄像头继续显示');
      const video = cameraVideoRef.current;
      
      // 检查原始流是否还在活跃状态
      const originalTracks = cameraStream.getTracks();
      const activeTracks = originalTracks.filter(track => track.readyState === 'live');
      console.log('录制期间原始流状态:', { total: originalTracks.length, active: activeTracks.length });
      
      // 检查摄像头视频元素是否有流绑定
      if (!video.srcObject) {
        console.log('录制期间摄像头视频元素没有流绑定，重新绑定');
        video.srcObject = cameraStream;
      }
      
      // 检查视频元素是否还在播放
      if (video.paused || video.ended) {
        console.log('录制期间摄像头视频停止，重新播放');
        video.play().catch(err => {
          console.warn('录制期间重新播放摄像头视频失败:', err);
        });
      }
      
      // 检查视频元素是否有实际画面
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        console.log('摄像头视频元素有画面数据:', { width: video.videoWidth, height: video.videoHeight });
      } else {
        console.log('摄像头视频元素没有画面数据');
        // 检查视频元素的其他属性
        console.log('视频元素状态:', {
          srcObject: !!video.srcObject,
          paused: video.paused,
          ended: video.ended,
          readyState: video.readyState,
          networkState: video.networkState,
          error: video.error
        });
        
        // 尝试使用不同的方法确保显示
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          console.log('视频元素有数据，尝试强制显示');
          // 尝试触发重新渲染
          video.style.display = 'none';
          setTimeout(() => {
            video.style.display = 'block';
          }, 10);
        }
      }
    }
  }, [isRecording, cameraStream]);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
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
    };
  }, [isRecording, cameraStream]);

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
    setCountdown(3); // 倒计时3秒
    setIsCountdownActive(true);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setIsCountdownActive(false);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          // 倒计时结束，开始录制和播放
          console.log('倒计时结束，开始录制和播放');
          console.log('摄像头状态:', { isCameraActive, isCameraReady, cameraStream: !!cameraStream });
          startRecordingAndPlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRecordingAndPlay = async () => {
    try {
      console.log('开始录制和播放，当前摄像头状态:', { isCameraActive, isCameraReady, cameraStream: !!cameraStream });
      
      // 确保摄像头流存在
      if (!cameraStream) {
        throw new Error('摄像头流不存在');
      }
      
      // 为录制创建独立的流副本，避免干扰显示
      const recordingStream = new MediaStream();
      cameraStream.getTracks().forEach(track => {
        const clonedTrack = track.clone();
        recordingStream.addTrack(clonedTrack);
        console.log('克隆轨道:', { kind: track.kind, originalReadyState: track.readyState, clonedReadyState: clonedTrack.readyState });
      });
      
      console.log('创建录制流副本，开始录制');
      console.log('原始流状态:', cameraStream.getTracks().map(track => ({ kind: track.kind, readyState: track.readyState })));
      console.log('录制流状态:', recordingStream.getTracks().map(track => ({ kind: track.kind, readyState: track.readyState })));
      
      // 确保清空之前的录制数据
      videoRecorder.current.cleanup();
      
      await videoRecorder.current.startRecordingWithStream(recordingStream);
      setIsRecording(true);
      console.log('录制已开始，isRecording = true');

      // 启动录制状态检查定时器
      const recordingCheckInterval = setInterval(() => {
        if (isRecording && videoRef.current) {
          // 检查视频是否停止播放
          if (videoRef.current.paused || videoRef.current.ended) {
            console.log('检测到教学视频停止播放，停止录制');
            clearInterval(recordingCheckInterval);
            stopRecording();
          }
        } else {
          clearInterval(recordingCheckInterval);
        }
      }, 500); // 每500ms检查一次

      // 启动摄像头流检查定时器
      const cameraCheckInterval = setInterval(() => {
        if (isRecording && cameraVideoRef.current && cameraStream) {
          const video = cameraVideoRef.current;
          
          // 检查原始流状态
          const originalTracks = cameraStream.getTracks();
          const activeTracks = originalTracks.filter(track => track.readyState === 'live');
          console.log('定时检查：原始流轨道状态:', originalTracks.map(track => ({ kind: track.kind, readyState: track.readyState })));
          
          // 检查摄像头视频元素是否有流绑定
          if (!video.srcObject) {
            console.log('定时检查：摄像头视频元素没有流绑定，重新绑定');
            video.srcObject = cameraStream;
          }
          // 检查摄像头视频是否在播放
          if (video.paused || video.ended) {
            console.log('定时检查：摄像头视频停止播放，重新播放');
            video.play().catch(err => {
              console.warn('定时检查：重新播放摄像头视频失败:', err);
            });
          }
        } else {
          clearInterval(cameraCheckInterval);
        }
      }, 1000); // 每1秒检查一次

      // 确保录制期间摄像头继续显示
      if (cameraVideoRef.current && cameraStream) {
        console.log('录制开始后，确保摄像头继续显示');
        const video = cameraVideoRef.current;
        
        // 检查原始流状态
        const originalTracks = cameraStream.getTracks();
        console.log('录制开始时原始流轨道:', originalTracks.map(track => ({ kind: track.kind, readyState: track.readyState, enabled: track.enabled })));
        
        // 确保视频元素有流绑定
        if (!video.srcObject) {
          console.log('录制开始时摄像头视频元素没有流绑定，重新绑定');
          video.srcObject = cameraStream;
        }
        
        if (video.paused || video.ended) {
          try {
            await video.play();
            console.log('录制期间摄像头视频播放成功');
          } catch (err) {
            console.warn('录制期间摄像头播放失败:', err);
          }
        }
        
        // 检查视频元素是否有画面数据
        setTimeout(() => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            console.log('录制开始后摄像头视频元素有画面数据:', { width: video.videoWidth, height: video.videoHeight });
          } else {
            console.log('录制开始后摄像头视频元素没有画面数据');
          }
        }, 1000);
      }

      // 从头播放教学视频
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        await videoRef.current.play();
        setIsPlaying(true);
        
        // 监听视频结束事件
        const handleVideoEnd = () => {
          console.log('教学视频播放结束，停止录制');
          stopRecording();
          videoRef.current?.removeEventListener('ended', handleVideoEnd);
        };
        
        // 监听视频暂停事件（手动停止）
        const handleVideoPause = () => {
          if (isRecording) {
            console.log('教学视频被手动暂停，停止录制');
            stopRecording();
            videoRef.current?.removeEventListener('pause', handleVideoPause);
          }
        };
        
        // 监听视频停止事件（seek等操作）
        const handleVideoSeeked = () => {
          if (isRecording && videoRef.current && videoRef.current.paused) {
            console.log('教学视频被seek操作停止，停止录制');
            stopRecording();
            videoRef.current?.removeEventListener('seeked', handleVideoSeeked);
          }
        };
        
        // 移除之前的事件监听器（如果有的话）
        videoRef.current.removeEventListener('ended', handleVideoEnd);
        videoRef.current.removeEventListener('pause', handleVideoPause);
        videoRef.current.removeEventListener('seeked', handleVideoSeeked);
        
        // 添加新的事件监听器
        videoRef.current.addEventListener('ended', handleVideoEnd);
        videoRef.current.addEventListener('pause', handleVideoPause);
        videoRef.current.addEventListener('seeked', handleVideoSeeked);
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
      // 启动摄像头
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 320,
          height: 240,
          facingMode: 'user'
        },
        audio: false
      });

      setCameraStream(stream);
      setIsCameraActive(true);
      setIsCameraReady(false); // 重置摄像头准备状态

    } catch (error) {
      console.error('启动跟学模式失败:', error);
      alert('无法访问摄像头，请检查权限设置');
    }
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
        <button className="btn btn-primary" onClick={handleBackToList}>
          返回列表
        </button>
        <button 
          className="btn btn-success" 
          onClick={handleFollowLearning}
          disabled={isCameraActive}
        >
          跟学
        </button>
        
        {/* 录制控制按钮 */}
        {isRecording && (
          <>
            <button 
              className="btn btn-warning" 
              onClick={handlePauseRecording}
              disabled={!isRecording}
            >
              {isPlaying ? '暂停录制' : '继续录制'}
            </button>
            <button 
              className="btn btn-danger" 
              onClick={handleStopRecording}
              disabled={!isRecording}
            >
              结束录制
            </button>
          </>
        )}
      </div>

      <div className="video-layout">
        <video
          ref={videoRef}
          className="video-player"
          src={`http://localhost:8128/video/${video.video_id}`}
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {isCameraActive && (
          <div className="camera-overlay">
            <div style={{ position: 'absolute', top: '-20px', left: '0', fontSize: '10px', color: 'white', background: 'rgba(0,0,0,0.7)', padding: '2px 4px' }}>
              摄像头状态: {isCameraActive ? '激活' : '未激活'} | 
              倒计时: {isCountdownActive ? countdown : '无'} | 
              录制: {isRecording ? '中' : '未录制'} |
              流状态: {cameraStream ? '有流' : '无流'} |
              视频播放: {cameraVideoRef.current ? (cameraVideoRef.current.paused ? '暂停' : '播放中') : '无元素'} |
              流绑定: {cameraVideoRef.current ? (cameraVideoRef.current.srcObject ? '已绑定' : '未绑定') : '无元素'}
            </div>
            <video
              ref={cameraVideoRef}
              width="160"
              height="120"
              className="camera-video"
              autoPlay
              muted
              playsInline
              style={{ 
                backgroundColor: '#333',
                display: 'block',
                width: '160px',
                height: '120px',
                objectFit: 'cover',
                border: '2px solid #fff',
                borderRadius: '4px',
                zIndex: 10,
                position: 'relative'
              }}
            />
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