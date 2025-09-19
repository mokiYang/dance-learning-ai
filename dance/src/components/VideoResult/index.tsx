import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService, ReferenceVideo, ComparisonResult, UserVideoUpload } from '../../services/api';
import VideoComparison from '../VideoComparison';
import './index.less';

const VideoResult: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [video, setVideo] = useState<ReferenceVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userVideoId, setUserVideoId] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<UserVideoUpload | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string>('');
  const [hasRecordedVideo, setHasRecordedVideo] = useState(false);
  const [showVideoComparison, setShowVideoComparison] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
        setError('视频ID不能为空');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const response = await apiService.getReferenceVideos();
        if (response.success) {
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

  // 录制视频后直接展示操作按钮，不自动进行分析

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      
      // 创建预览URL
      const url = URL.createObjectURL(file);
      setUploadedVideoUrl(url);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('请先选择要上传的视频文件');
      return;
    }

    if (!video) {
      setError('参考视频信息不存在');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      // 第一步：上传用户视频并提取骨骼数据
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || '上传失败');
      }

      setUploadResult(uploadResult);
      setUserVideoId(uploadResult.user_video_id);

      // 第二步：使用已上传的视频进行比较
      const comparisonResult = await apiService.compareWithUploadedVideo(
        uploadResult.user_video_id,
        video.video_id,
        0.3
      );

      if (comparisonResult.success) {
        setComparisonResult(comparisonResult);
      } else {
        setError('视频分析失败，请重试');
      }
    } catch (err) {
      setError('上传失败，请检查网络连接');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleReupload = async () => {
    // 如果已有用户视频，先删除旧的文件和骨骼数据
    if (userVideoId) {
      try {
        await apiService.deleteUserVideo(userVideoId);
      } catch (err) {
        console.warn('删除旧视频失败:', err);
      }
    }

    setSelectedFile(null);
    setUploadedVideoUrl('');
    setComparisonResult(null);
    setUserVideoId('');
    setUploadResult(null);
    setError(null);
    setHasRecordedVideo(false);
    setRecordedVideoBlob(null);
    setRecordedVideoUrl('');
    setIsAnalyzing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadVideo = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    setError(null);

    try {
      // 直接上传视频，不进行分析
      const response = await apiService.uploadReferenceVideo(
        selectedFile,
        '用户上传的舞蹈视频',
        '用户',
        selectedFile.name
      );

      if (response.success) {
        alert('视频上传成功！');
        // 可以跳转到视频列表页面
        navigate('/videos');
      } else {
        setError('视频上传失败，请重试');
      }
    } catch (err) {
      setError('上传失败，请检查网络连接');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzeQuality = async () => {
    if (!selectedFile || !video) return;
    
    setIsAnalyzing(true);
    setError(null);

    try {
      // 第一步：上传用户视频
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || '上传失败');
      }

      setUploadResult(uploadResult);
      setUserVideoId(uploadResult.user_video_id);

      // 第二步：进行分析
      const comparisonResult = await apiService.compareWithUploadedVideo(
        uploadResult.user_video_id,
        video.video_id,
        0.3
      );

      if (comparisonResult.success) {
        setComparisonResult(comparisonResult);
        setShowVideoComparison(true);
      } else {
        setError('视频分析失败，请重试');
      }
    } catch (err) {
      setError('分析失败，请检查网络连接');
      console.error('分析失败:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleBackToList = () => {
    navigate('/');
  };

  const handleBackToPlayer = () => {
    navigate(`/video/${id}`);
  };

  const handleRetryUpload = () => {
    setError(null);
    // 重新触发上传
    if (hasRecordedVideo && selectedFile && video) {
      handleUpload();
    }
  };

  if (loading) {
    return (
      <div className="video-result-container">
        <div className="loading-container">
          <div className="loading-spinner">加载中...</div>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="video-result-container">
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
    <div className="video-result-container">
      <div className="controls">
        <button className="btn btn-secondary" onClick={handleBackToList}>
          返回列表
        </button>
        <button className="btn btn-primary" onClick={handleBackToPlayer}>
          返回播放器
        </button>
      </div>

      <div className="result-content">
        <div className="upload-section">
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
                <button
                  className="btn btn-outline"
                  onClick={handleReupload}
                  disabled={uploading || isAnalyzing}
                >
                  重新录制
                </button>
              </div>
            </div>
          ) : isAnalyzing ? (
            <div className="analyzing-status">
              <h3>正在分析视频质量</h3>
              <div className="loading-spinner">提取骨骼数据中...</div>
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
                  />
                  
                  <div className="upload-actions">
                    <button
                      className="btn btn-success"
                      onClick={handleUpload}
                      disabled={uploading}
                    >
                      {uploading ? '分析中...' : '开始分析'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleReupload}
                      disabled={uploading}
                    >
                      重新选择
                    </button>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="uploading-status">
                  <div className="loading-spinner">分析中...</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          {hasRecordedVideo && (
            <div className="error-actions">
              <button className="btn btn-primary" onClick={handleRetryUpload}>
                重试上传
              </button>
              <button className="btn btn-secondary" onClick={handleReupload}>
                重新录制
              </button>
            </div>
          )}
        </div>
      )}

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
            <div className="loading-spinner">提取骨骼数据中...</div>
            <p>请稍候，正在分析您的舞蹈动作...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoResult;
