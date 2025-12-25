import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService, ReferenceVideo, ComparisonResult } from '../../services/api';
import VideoComparison from '../VideoComparison';
import { showToast } from '../Toast/ToastContainer';
import './index.less';

const VideoResult: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [video, setVideo] = useState<ReferenceVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string>('');
  const [hasRecordedVideo, setHasRecordedVideo] = useState(false);
  const [showVideoComparison, setShowVideoComparison] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<string>('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 检查是否有传递过来的录制视频数据
  useEffect(() => {
    if (location.state) {
      const { recordedVideo, recordedVideoUrl, videoInfo } = location.state as any;
      if (recordedVideo && recordedVideoUrl) {
        setRecordedVideoBlob(recordedVideo);
        setRecordedVideoUrl(recordedVideoUrl);
        setHasRecordedVideo(true);
        setUploadedVideoUrl(recordedVideoUrl);
        
        // 将Blob转换为File对象
        const file = new File([recordedVideo], videoInfo.filename, { type: recordedVideo.type });
        setSelectedFile(file);
        
        console.log('接收到录制的视频数据:', videoInfo);
      }
    }
  }, [location.state]);

  // 根据ID获取视频数据
  useEffect(() => {
    const fetchVideo = async () => {
      if (!id) {
        showToast('视频ID不能为空', 'error');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        const response = await apiService.getReferenceVideos();
        if (response.success) {
          const foundVideo = response.videos.find(v => v.video_id === id);
          if (foundVideo) {
            setVideo(foundVideo);
          } else {
            showToast('未找到指定的视频', 'error');
          }
        } else {
          showToast('获取视频数据失败', 'error');
        }
      } catch (err) {
        showToast('网络错误，请稍后重试', 'error');
        console.error('获取视频数据失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  // 组件卸载时清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // 录制视频后直接展示操作按钮，不自动进行分析

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // 创建预览URL
      const url = URL.createObjectURL(file);
      setUploadedVideoUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast('请先选择要上传的视频文件', 'error');
      return;
    }

    if (!video) {
      showToast('参考视频信息不存在', 'error');
      return;
    }

    try {
      setUploading(true);
      setExtractionProgress('正在上传视频...');

      // 第一步：上传用户视频（后台异步提取骨骼数据）
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || '上传失败');
      }

      console.log('用户视频上传成功:', uploadResult);

      // 如果骨骼数据尚未提取完成，启动轮询
      if (!uploadResult.pose_data_extracted) {
        setExtractionProgress('正在提取骨骼数据（0%）...');
        
        try {
          // 轮询用户视频状态（无超时限制）
          const pollResult = await apiService.pollUserVideoStatus(
            uploadResult.user_video_id,
            (progress, extracted) => {
              if (extracted) {
                setExtractionProgress('骨骼数据提取完成');
              } else {
                setExtractionProgress(`正在提取骨骼数据（${progress}%）...`);
              }
            },
            2000  // 每2秒轮询一次
          );
          
          console.log('轮询结果:', pollResult);
          
          // 检查处理结果
          if (!pollResult.success) {
            console.log('骨骼提取失败，显示错误:', pollResult.error);
            console.error('=== 准备显示Toast错误 ===');
            showToast(pollResult.error || '骨骼数据提取失败', 'error', 6000);
            setUploading(false);
            setExtractionProgress('');
            return;
          }
          
          console.log('用户视频骨骼数据提取完成');
        } catch (pollError) {
          console.error('骨骼数据提取出错:', pollError);
          showToast('网络错误，请重试', 'error');
          setUploading(false);
          setExtractionProgress('');
          return;
        }
      }

      // 第二步：进行对比分析
      setExtractionProgress('正在进行动作对比分析...');
      
      try {
        const comparisonResult = await apiService.compareWithUploadedVideo(
          uploadResult.user_video_id,
          video.video_id,
          0.3
        );

        if (comparisonResult.success) {
          // 检查是否有有效的骨骼数据
          const userPoseFrames = comparisonResult.video_info?.user?.pose_frames || 0;
          
          if (userPoseFrames === 0) {
            showToast('视频中未检测到人像，无法进行动作分析。请确保视频中有完整的人体姿态。', 'error', 5000);
            setUploading(false);
            setExtractionProgress('');
            return;
          }
          
          console.log('对比分析完成，显示结果界面');
          setComparisonResult(comparisonResult);
          setShowVideoComparison(true);
          setExtractionProgress('');
        } else {
          showToast('视频分析失败，请重试', 'error');
        }
      } catch (compareError: any) {
        console.error('对比分析失败:', compareError);
        // 检查是否是骨骼数据相关的错误
        const errorMsg = compareError?.message || String(compareError);
        if (errorMsg.includes('骨骼数据不存在') || errorMsg.includes('pose_data')) {
          showToast('视频中未检测到人像，无法进行动作分析。请上传包含完整人体姿态的舞蹈视频。', 'error', 5000);
        } else {
          showToast('视频分析失败：' + errorMsg, 'error');
        }
      }
    } catch (err) {
      showToast('上传失败，请检查网络连接', 'error');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
      setExtractionProgress('');
    }
  };

  const handleUploadVideo = async () => {
    if (!selectedFile) return;
    
    setUploading(true);

    try {
      // 直接上传视频，不进行分析
      const response = await apiService.uploadReferenceVideo(
        selectedFile,
        '用户上传的舞蹈视频',
        '用户',
        selectedFile.name
      );

      if (response.success) {
        showToast('视频上传成功！', 'success');
        // 可以跳转到视频列表页面
        navigate('/videos');
      } else {
        showToast('视频上传失败，请重试', 'error');
      }
    } catch (err) {
      showToast('上传失败，请检查网络连接', 'error');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzeQuality = async () => {
    if (!selectedFile || !video) return;
    
    setIsAnalyzing(true);
    setExtractionProgress('正在上传视频...');

    try {
      // 第一步：上传用户视频（后台异步提取骨骼数据）
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || '上传失败');
      }

      console.log('用户视频上传成功:', uploadResult);

      // 如果骨骼数据尚未提取完成，启动轮询
      if (!uploadResult.pose_data_extracted) {
        setExtractionProgress('正在提取骨骼数据（0%）...');
        
        try {
          // 轮询用户视频状态（无超时限制）
          const pollResult = await apiService.pollUserVideoStatus(
            uploadResult.user_video_id,
            (progress, extracted) => {
              if (extracted) {
                setExtractionProgress('骨骼数据提取完成');
              } else {
                setExtractionProgress(`正在提取骨骼数据（${progress}%）...`);
              }
            },
            2000  // 每2秒轮询一次
          );
          
          console.log('轮询结果:', pollResult);
          
          // 检查处理结果
          if (!pollResult.success) {
            console.log('骨骼提取失败，显示错误:', pollResult.error);
            console.error('=== 准备显示Toast错误 ===');
            showToast(pollResult.error || '骨骼数据提取失败', 'error', 6000);
            setIsAnalyzing(false);
            return;
          }
          
          console.log('用户视频骨骼数据提取完成');
        } catch (pollError) {
          console.error('骨骼数据提取出错:', pollError);
          showToast('网络错误，请重试', 'error');
          setIsAnalyzing(false);
          return;
        }
      }

      // 第二步：进行分析
      setExtractionProgress('正在进行动作对比分析...');
      
      try {
        const comparisonResult = await apiService.compareWithUploadedVideo(
          uploadResult.user_video_id,
          video.video_id,
          0.3
        );

        if (comparisonResult.success) {
          // 检查是否有有效的骨骼数据
          const userPoseFrames = comparisonResult.video_info?.user?.pose_frames || 0;
          
          if (userPoseFrames === 0) {
            showToast('视频中未检测到人像，无法进行动作分析。请确保视频中有完整的人体姿态。', 'error', 5000);
            setIsAnalyzing(false);
            setExtractionProgress('');
            return;
          }
          
          setComparisonResult(comparisonResult);
          setShowVideoComparison(true);
          setExtractionProgress('');
        } else {
          showToast('视频分析失败，请重试', 'error');
        }
      } catch (compareError: any) {
        console.error('对比分析失败:', compareError);
        // 检查是否是骨骼数据相关的错误
        const errorMsg = compareError?.message || String(compareError);
        if (errorMsg.includes('骨骼数据不存在') || errorMsg.includes('pose_data')) {
          showToast('视频中未检测到人像，无法进行动作分析。请上传包含完整人体姿态的舞蹈视频。', 'error', 5000);
        } else {
          showToast('视频分析失败：' + errorMsg, 'error');
        }
      }
    } catch (err) {
      showToast('分析失败，请检查网络连接', 'error');
      console.error('分析失败:', err);
    } finally {
      setIsAnalyzing(false);
      setExtractionProgress('');
    }
  };

  const handleBackToList = () => {
    navigate('/');
  };

  const handleBackToPlayer = () => {
    navigate(`/video/${id}`);
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
        <button className="btn-back" onClick={handleBackToPlayer}>
          ←
        </button>
      </div>

      <div className="result-content">
        {hasRecordedVideo ? (
          <div className="video-preview">
              <h3>您录制的舞蹈视频</h3>
              <div className="video-container">
                <video
                  className="preview-video"
                  src={recordedVideoUrl}
                  controls
                  muted
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              </div>
              <div className="video-info">
                <p>文件大小: {(recordedVideoBlob?.size ? recordedVideoBlob.size / 1024 / 1024 : 0).toFixed(2)} MB</p>
                <p>格式: {recordedVideoBlob?.type || 'video/webm'}</p>
              </div>
              
              <div className="action-buttons">
                <button
                  className="btn btn-primary"
                  onClick={handleUploadVideo}
                  disabled={uploading || isAnalyzing}
                >
                  上传视频
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleAnalyzeQuality}
                  disabled={uploading || isAnalyzing}
                >
                  分析视频质量
                </button>
              </div>
            </div>
          ) : isAnalyzing ? (
            <div className="analyzing-status">
              <h3>正在分析视频质量</h3>
              <div className="loading-spinner">{extractionProgress || '处理中...'}</div>
              <p>请稍候，正在分析您的舞蹈动作...</p>
            </div>
          ) : (
            <div className="upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              <button
                className="btn btn-primary upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                选择视频文件
              </button>

              {selectedFile && (
                <div className="selected-file">
                  <p>已选择文件: {selectedFile.name}</p>
                  <p>文件大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  
                  <video
                    className="preview-video"
                    src={uploadedVideoUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                  />
                  
                  <div className="upload-actions">
                    <button
                      className="btn btn-success"
                      onClick={handleUpload}
                      disabled={uploading}
                    >
                      {uploading ? '分析中...' : '开始分析'}
                    </button>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="uploading-status">
                  <div className="loading-spinner">{extractionProgress || '上传中...'}</div>
                </div>
              )}
            </div>
          )}
      </div>

      {showVideoComparison && comparisonResult && (
        <VideoComparison
          workId={comparisonResult.work_id}
          onClose={() => setShowVideoComparison(false)}
        />
      )}

      {/* 浮层loading */}
      {isAnalyzing && (
        <div className="loading-overlay">
          <div className="loading-content">
            <h3>正在分析视频质量</h3>
            <div className="loading-spinner">{extractionProgress || '处理中...'}</div>
            <p>请稍候，正在分析您的舞蹈动作...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoResult;
