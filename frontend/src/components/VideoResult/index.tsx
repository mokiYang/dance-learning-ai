import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiService, ReferenceVideo, ComparisonResult } from '../../services/api';
import { showToast } from '../Toast/ToastContainer';
import BaseVideoPlayer, { ControlButton } from '../BaseVideoPlayer';
import UploadFormModal from '../UploadFormModal';
import { extractThumbnailFromBlob } from '../../utils/videoThumbnail';
import './index.less';

const VideoResult: React.FC = () => {
  const { t, i18n } = useTranslation();
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
  // 对比页现在是独立路由，不再使用浮层
  // const [showVideoComparison, setShowVideoComparison] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<string>('');
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoPoster, setVideoPoster] = useState<string | undefined>(undefined);

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
        
        // 从视频Blob中提取第一帧作为封面
        extractThumbnailFromBlob(recordedVideo)
          .then((thumbnailUrl) => {
            if (thumbnailUrl) {
              setVideoPoster(thumbnailUrl);
              console.log('成功生成视频封面');
            }
          })
          .catch((error) => {
            console.error('生成视频封面失败:', error);
            // 失败不影响功能，只是没有封面
          });
        
        console.log('接收到录制的视频数据:', videoInfo);
      }
    }
  }, [location.state]);

  // 根据ID获取视频数据
  useEffect(() => {
    const fetchVideo = async () => {
      if (!id) {
        showToast(t('common.videoIdRequired'), 'error');
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
            showToast(t('common.videoNotFound'), 'error');
          }
        } else {
          showToast(t('common.videoDataFailed'), 'error');
        }
      } catch (err) {
        showToast(t('common.networkError'), 'error');
        console.error('获取视频数据失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id, i18n.resolvedLanguage]);

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
      showToast(t('result.selectVideoFirst'), 'error');
      return;
    }

    if (!video) {
      showToast(t('result.referenceMissing'), 'error');
      return;
    }

    try {
      setUploading(true);
      setExtractionProgress(t('result.uploadingVideo'));

      // 第一步：上传用户视频（后台异步提取骨骼数据）
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || t('common.uploadFailed'));
      }

      console.log('用户视频上传成功:', uploadResult);

      // 如果骨骼数据尚未提取完成，启动轮询
      if (!uploadResult.pose_data_extracted) {
        setExtractionProgress(t('result.extracting', { progress: 0 }));
        
        try {
          // 轮询用户视频状态（无超时限制）
          const pollResult = await apiService.pollUserVideoStatus(
            uploadResult.user_video_id,
            (progress, extracted) => {
              if (extracted) {
                setExtractionProgress(t('result.extracted'));
              } else {
                setExtractionProgress(t('result.extracting', { progress }));
              }
            },
            2000  // 每2秒轮询一次
          );
          
          console.log('轮询结果:', pollResult);
          
          // 检查处理结果
          if (!pollResult.success) {
            console.log('骨骼提取失败，显示错误:', pollResult.error);
            console.error('=== 准备显示Toast错误 ===');
            showToast(pollResult.error || t('result.extractionFailed'), 'error', 6000);
            setUploading(false);
            setExtractionProgress('');
            return;
          }
          
          console.log('用户视频骨骼数据提取完成');
        } catch (pollError) {
          console.error('骨骼数据提取出错:', pollError);
          showToast(t('common.networkRetry'), 'error');
          setUploading(false);
          setExtractionProgress('');
          return;
        }
      }

      // 第二步：进行对比分析
      setExtractionProgress(t('result.comparing'));
      
      try {
        const comparisonResult = await apiService.compareWithUploadedVideo(
          uploadResult.user_video_id,
          video.video_id,
          0.4
        );

        if (comparisonResult.success) {
          // 检查是否有有效的骨骼数据
          const userPoseFrames = comparisonResult.video_info?.user?.pose_frames || 0;
          
          if (userPoseFrames === 0) {
            showToast(t('result.noPersonEnsure'), 'error', 5000);
            setUploading(false);
            setExtractionProgress('');
            return;
          }
          
          console.log('对比分析完成，显示结果界面');
          setComparisonResult(comparisonResult);
          setExtractionProgress('');
          // 直接跳转到对比页的独立路由
          navigate(`/comparison/${comparisonResult.work_id}?videoId=${id}`);
        } else {
          showToast(t('result.analysisFailed'), 'error');
        }
      } catch (compareError: any) {
        console.error('对比分析失败:', compareError);
        // 检查是否是骨骼数据相关的错误
        const errorMsg = compareError?.message || String(compareError);
        if (errorMsg.includes('骨骼数据不存在') || errorMsg.includes('pose_data')) {
          showToast(t('result.noPersonUpload'), 'error', 5000);
        } else {
          showToast(t('result.analysisFailedWithReason', { message: errorMsg }), 'error');
        }
      }
    } catch (err) {
      showToast(t('common.uploadNetworkFailed'), 'error');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
      setExtractionProgress('');
    }
  };

  const handleUploadVideoClick = () => {
    if (!selectedFile) {
      showToast(t('result.selectVideoFirst'), 'error');
      return;
    }
    setShowUploadForm(true);
    setVideoTitle('');
  };

  const handleUploadCancel = () => {
    setShowUploadForm(false);
    setVideoTitle('');
  };

  const handleUploadVideo = async () => {
    if (!selectedFile) return;
    
    if (!videoTitle.trim()) {
      showToast(t('common.enterVideoTitle'), 'error');
      return;
    }

    setUploading(true);

    try {
      // 使用上传用户视频到永久存储的API
      const response = await apiService.uploadUserVideoPermanent(
        selectedFile,
        videoTitle.trim()
      );

      if (response.success) {
        showToast(t('upload.successSaved'), 'success', 3000);
        setShowUploadForm(false);
        setVideoTitle('');
        // 可以跳转到视频列表页面
        navigate('/?tab=user');
      } else {
        showToast(t('result.permanentUploadFailed'), 'error');
      }
    } catch (err) {
      showToast(t('common.uploadNetworkFailed'), 'error');
      console.error('上传失败:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyzeQuality = async () => {
    if (!selectedFile || !video) return;
    
    setIsAnalyzing(true);
    setExtractionProgress(t('result.uploadingVideo'));

    try {
      // 第一步：上传用户视频（后台异步提取骨骼数据）
      const uploadResult = await apiService.uploadUserVideo(selectedFile, video.video_id);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.message || t('common.uploadFailed'));
      }

      console.log('用户视频上传成功:', uploadResult);

      // 如果骨骼数据尚未提取完成，启动轮询
      if (!uploadResult.pose_data_extracted) {
        setExtractionProgress(t('result.extracting', { progress: 0 }));
        
        try {
          // 轮询用户视频状态（无超时限制）
          const pollResult = await apiService.pollUserVideoStatus(
            uploadResult.user_video_id,
            (progress, extracted) => {
              if (extracted) {
                setExtractionProgress(t('result.extracted'));
              } else {
                setExtractionProgress(t('result.extracting', { progress }));
              }
            },
            2000  // 每2秒轮询一次
          );
          
          console.log('轮询结果:', pollResult);
          
          // 检查处理结果
          if (!pollResult.success) {
            console.log('骨骼提取失败，显示错误:', pollResult.error);
            console.error('=== 准备显示Toast错误 ===');
            showToast(pollResult.error || t('result.extractionFailed'), 'error', 6000);
            setIsAnalyzing(false);
            return;
          }
          
          console.log('用户视频骨骼数据提取完成');
        } catch (pollError) {
          console.error('骨骼数据提取出错:', pollError);
          showToast(t('common.networkRetry'), 'error');
          setIsAnalyzing(false);
          return;
        }
      }

      // 第二步：进行分析
      setExtractionProgress(t('result.comparing'));
      
      try {
        const comparisonResult = await apiService.compareWithUploadedVideo(
          uploadResult.user_video_id,
          video.video_id,
          0.4
        );

        if (comparisonResult.success) {
          // 检查是否有有效的骨骼数据
          const userPoseFrames = comparisonResult.video_info?.user?.pose_frames || 0;
          
          if (userPoseFrames === 0) {
            showToast(t('result.noPersonEnsure'), 'error', 5000);
            setIsAnalyzing(false);
            setExtractionProgress('');
            return;
          }
          
          setComparisonResult(comparisonResult);
          setExtractionProgress('');
          setIsAnalyzing(false);
          // 直接跳转到对比页的独立路由，传递视频ID以便返回时使用
          navigate(`/comparison/${comparisonResult.work_id}?videoId=${id}`);
        } else {
          showToast(t('result.analysisFailed'), 'error');
        }
      } catch (compareError: any) {
        console.error('对比分析失败:', compareError);
        // 检查是否是骨骼数据相关的错误
        const errorMsg = compareError?.message || String(compareError);
        if (errorMsg.includes('骨骼数据不存在') || errorMsg.includes('pose_data')) {
          showToast(t('result.noPersonUpload'), 'error', 5000);
        } else {
          showToast(t('result.analysisFailedWithReason', { message: errorMsg }), 'error');
        }
      }
    } catch (err) {
      showToast(t('result.connectionAnalysisFailed'), 'error');
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

  // 构建右侧按钮配置
  const rightButtons: ControlButton[] = [];
  
  if (hasRecordedVideo) {
    rightButtons.push(
      {
        label: t('common.submit'),
        className: 'btn-success',
        onClick: handleUploadVideoClick,
        disabled: uploading || isAnalyzing,
        visible: true,
      },
      {
        label: t('result.analyzeQuality'),
        className: 'btn-warning',
        onClick: handleAnalyzeQuality,
        disabled: uploading || isAnalyzing,
        visible: true,
      }
    );
  }

  // 渲染视频内容
  const renderVideoContent = () => {
    if (hasRecordedVideo) {
      return null; // BaseVideoPlayer 会渲染视频
    } else if (isAnalyzing) {
      return (
        <div className="analyzing-status">
          <h3>{t('result.analyzingQuality')}</h3>
          <div className="loading-spinner">{extractionProgress || t('common.processing')}</div>
          <p>{t('result.analyzingHint')}</p>
        </div>
      );
    } else {
      return (
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
            {t('result.chooseFile')}
          </button>

          {selectedFile && (
            <div className="selected-file">
              <p>{t('common.selectedFile', { name: selectedFile.name })}</p>
              <p>{t('common.fileSize', { size: (selectedFile.size / 1024 / 1024).toFixed(2) })}</p>
              
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
                  {t(uploading ? 'result.analyzing' : 'result.startAnalysis')}
                </button>
              </div>
            </div>
          )}

          {uploading && (
            <div className="uploading-status">
              <div className="loading-spinner">{extractionProgress || t('common.uploading')}</div>
            </div>
          )}
        </div>
      );
    }
  };

  return (
    <>
      {hasRecordedVideo ? (
        <BaseVideoPlayer
          videoSrc={recordedVideoUrl}
          poster={videoPoster}
          onBack={handleBackToPlayer}
          rightButtons={rightButtons}
          loading={loading}
          error={!video ? t('common.videoMissing') : null}
          videoProps={{
            muted: true,
            autoPlay: true,
            playsInline: true,
            preload: 'metadata',
          }}
        />
      ) : (
        <div className="video-player-container">
          <div className="controls">
            <button className="btn-back" onClick={handleBackToPlayer}>
              ←
            </button>
          </div>
          <div className="video-layout">
            {renderVideoContent()}
          </div>
        </div>
      )}

      {/* 对比页现在是独立路由，不再使用浮层 */}

      {/* 上传表单弹窗 */}
      <UploadFormModal
        visible={showUploadForm}
        title={t('upload.userTitle')}
        onClose={handleUploadCancel}
        showOverlay={true}
      >
        <div className="form-group">
          <label htmlFor="video-title">{t('common.videoTitle')}</label>
          <input
            id="video-title"
            type="text"
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            placeholder={t('common.enterVideoTitle')}
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
            {t('common.cancel')}
          </button>
          <button
            className="submit-button"
            onClick={handleUploadVideo}
            disabled={uploading || !videoTitle.trim()}
          >
            {uploading ? (
              <>
                <span className="upload-icon">⏳</span>
                {t('common.uploading')}
              </>
            ) : (
              <>
                <span className="upload-icon">📤</span>
                {t('common.confirmUpload')}
              </>
            )}
          </button>
        </div>
      </UploadFormModal>

      {/* 浮层loading */}
      {isAnalyzing && (
        <div className="loading-overlay">
          <div className="loading-content">
            <h3>{t('result.analyzingQuality')}</h3>
            <div className="loading-spinner">{extractionProgress || t('common.processing')}</div>
            <p>{t('result.analyzingHint')}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoResult;
