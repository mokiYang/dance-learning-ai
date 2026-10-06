import React, { useState, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { apiService } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { showToast } from "../Toast/ToastContainer";
import UploadFormModal from "../UploadFormModal";
import "./index.less";

/**
 * 上传模式：
 *  - 'home'      默认模式：用户可选"教学视频/普通用户视频"
 *  - 'beginner'  新手入门列表页模式：仅 admin 可上传，强制为 category=beginner 的教学视频，
 *                不展示"用户视频"选项（业务上禁止往该分类放普通用户视频）
 */
export type VideoUploadMode = 'home' | 'beginner';

interface VideoUploadProps {
  onUploadSuccess?: (taskId?: string, videoId?: string) => void;
  onUploadError?: (error: string) => void;
  mode?: VideoUploadMode;
}

export interface VideoUploadRef {
  handleFileUploadClick: () => void;
}

const VideoUpload = forwardRef<VideoUploadRef, VideoUploadProps>(({
  onUploadSuccess,
  onUploadError,
  mode = 'home',
}, ref) => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth(); // 获取当前登录用户
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [title, setTitle] = useState("");
  // home 模式下用户可切换；beginner 模式下强制为 true（教学视频，category=beginner）
  const [isTeachingVideo, setIsTeachingVideo] = useState(true);

  const isBeginnerMode = mode === 'beginner';

  // 生成唯一的ID
  const uploadId = `video-upload-${Math.random().toString(36).substring(2, 11)}`;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // beginner 模式下二次校验：非 admin 不允许触发上传
    if (isBeginnerMode && !isAdmin) {
      const errorMsg = t('beginner.adminOnly');
      showToast(errorMsg, "error");
      onUploadError?.(errorMsg);
      // 清空文件输入框
      event.target.value = "";
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith("video/")) {
      const errorMsg = t('upload.validVideo');
      showToast(errorMsg, "error");
      onUploadError?.(errorMsg);
      return;
    }

    // 验证文件大小 (限制为100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      const errorMsg = t('upload.maxSize');
      showToast(errorMsg, "error");
      onUploadError?.(errorMsg);
      return;
    }

    setSelectedFile(file);
    setShowForm(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);

    try {
      // 使用当前登录用户的用户名作为作者
      const authorName = user?.username || author || t('upload.anonymous');
      
      let response;
      
      if (isBeginnerMode) {
        // 新手入门列表页：固定上传为 category=beginner 的参考视频
        response = await apiService.uploadReferenceVideo(
          selectedFile,
          description,
          authorName,
          title,
          'beginner'
        );
      } else if (isTeachingVideo) {
        // 作为教学视频发布：需要提取骨骼
        response = await apiService.uploadReferenceVideo(
          selectedFile,
          description,
          authorName,
          title,
          'normal'
        );
      } else {
        // 作为普通用户视频发布：不需要提取骨骼，直接上传
        response = await apiService.uploadUserVideoPermanent(
          selectedFile,
          title
        );
      }

      if (response.success) {
        // 获取task_id和video_id
        const taskId = response.task_id;
        const videoId = response.video_id;
        const filename = response.filename || selectedFile?.name || t('upload.video');
        
        // 先关闭表单，再显示 Toast（确保 Toast 不被表单遮挡）
        setSelectedFile(null);
        setDescription("");
        setAuthor("");
        setTitle("");
        setIsTeachingVideo(true); // 重置为默认值
        setShowForm(false);
        
        // 延迟一下显示 Toast，确保表单已关闭
        setTimeout(() => {
          const videoType = t(isBeginnerMode
            ? 'upload.beginnerType'
            : (isTeachingVideo ? 'upload.teachingType' : 'upload.userType'));
          if (taskId) {
            // 有异步任务，显示全局成功提示
            showToast(
              t('upload.success', { type: videoType, filename }),
              "success",
              3000
            );
          } else {
            // 没有task_id，使用旧的同步模式
            showToast(t('upload.success', { type: videoType, filename }), "success", 2000);
          }
        }, 100);
        
        onUploadSuccess?.(taskId, videoId);
      } else {
        const errorMsg = (response as any).error || response.message || t('common.uploadFailed');
        // 先关闭表单，再显示错误 Toast
        setShowForm(false);
        setTimeout(() => {
          showToast(errorMsg, "error");
        }, 100);
        onUploadError?.(errorMsg);
      }
    } catch (err) {
      console.error("上传失败:", err);
      const errorMsg = t('common.uploadNetworkFailed');
      showToast(errorMsg, "error");
      onUploadError?.(errorMsg);
    } finally {
      setUploading(false);
      // 清空文件输入框
      const fileInput = document.getElementById(uploadId) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    }
  };

  const handleFileUploadClick = () => {
    // beginner 模式下非 admin 直接拒绝触发，避免选了文件再报错
    if (isBeginnerMode && !isAdmin) {
      showToast(t('beginner.adminOnly'), "error");
      return;
    }
    // 触发文件选择
    const fileInput = document.getElementById(uploadId) as HTMLInputElement;
    fileInput?.click();
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    handleFileUploadClick
  }));

  const handleCancel = () => {
    setSelectedFile(null);
    setDescription("");
    setAuthor("");
    setTitle("");
    setIsTeachingVideo(true); // 重置为默认值
    setShowForm(false);
    // 清空文件输入框
    const fileInput = document.getElementById(uploadId) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  return (
    <div className="video-upload">
      {/* 隐藏的文件输入框 */}
      <input
        id={uploadId}
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />

      {/* 上传表单弹窗 */}
      <UploadFormModal
        visible={showForm}
        title={t(isBeginnerMode ? 'upload.beginnerTitle' : 'upload.infoTitle')}
        fileName={selectedFile?.name}
        onClose={handleCancel}
      >
        <div className="form-group">
          <label htmlFor="title">{t('common.videoTitle')}</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('common.enterVideoTitle')}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="description">{t('upload.description')}</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('upload.descriptionPlaceholder')}
            rows={3}
          />
        </div>
        
        <div className="form-group">
          <label className="video-type-label">{t('upload.type')}</label>
          <div className="video-type-selector">
            {isBeginnerMode ? (
              // 新手入门模式：只展示一种固定类型，作为提示而不是选择器
              <div className="video-type-option active">
                <div className="option-icon">🌟</div>
                <div className="option-content">
                  <div className="option-title">{t('upload.beginnerType')}</div>
                  <div className="option-desc">{t('upload.beginnerDescription')}</div>
                </div>
                <div className="option-check">✓</div>
              </div>
            ) : (
              <>
                <div
                  className={`video-type-option ${isTeachingVideo ? 'active' : ''}`}
                  onClick={() => setIsTeachingVideo(true)}
                >
                  <div className="option-icon">📚</div>
                  <div className="option-content">
                    <div className="option-title">{t('upload.teachingType')}</div>
                    <div className="option-desc">{t('upload.teachingDescription')}</div>
                  </div>
                  {isTeachingVideo && <div className="option-check">✓</div>}
                </div>
                <div
                  className={`video-type-option ${!isTeachingVideo ? 'active' : ''}`}
                  onClick={() => setIsTeachingVideo(false)}
                >
                  <div className="option-icon">👤</div>
                  <div className="option-content">
                    <div className="option-title">{t('upload.userType')}</div>
                    <div className="option-desc">{t('upload.userDescription')}</div>
                  </div>
                  {!isTeachingVideo && <div className="option-check">✓</div>}
                </div>
              </>
            )}
          </div>
        </div>
        
        <div className="form-actions">
          <button
            className="cancel-button"
            onClick={handleCancel}
            disabled={uploading}
          >
            {t('common.cancel')}
          </button>
          <button
            className="submit-button"
            onClick={handleUpload}
            disabled={uploading || !title.trim()}
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
    </div>
  );
});

export default VideoUpload;
