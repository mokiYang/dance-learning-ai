import React, { useState, forwardRef, useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { apiService } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { showToast } from "../Toast/ToastContainer";
import UploadFormModal from "../UploadFormModal";
import "./index.less";

interface UserVideoUploadProps {
  onUploadSuccess?: (taskId?: string, videoId?: string) => void;
  onUploadError?: (error: string) => void;
}

export interface UserVideoUploadRef {
  handleFileUploadClick: () => void;
}

const UserVideoUpload = forwardRef<UserVideoUploadRef, UserVideoUploadProps>(({
  onUploadSuccess,
  onUploadError,
}, ref) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  // 生成唯一的ID
  const uploadId = `user-video-upload-${Math.random().toString(36).substring(2, 11)}`;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

    if (!title.trim()) {
      showToast(t('common.enterVideoTitle'), "error");
      return;
    }

    setUploading(true);

    try {
      const response = await apiService.uploadUserVideoPermanent(
        selectedFile,
        title.trim()
      );

      if (response.success) {
        // 重置表单
        setSelectedFile(null);
        setTitle("");
        setShowForm(false);
        
        // 获取task_id和video_id
        const taskId = response.task_id;
        const videoId = response.video_id;
        
        if (taskId) {
          // 有异步任务，显示全局成功提示
          showToast(
            t('upload.simpleSuccess', { filename: response.filename }),
            "success",
            3000
          );
          
          onUploadSuccess?.(taskId, videoId);
        } else {
          // 没有task_id，使用旧的同步模式
          showToast(t('upload.simpleSuccess', { filename: response.filename }), "success", 2000);
          
          onUploadSuccess?.(undefined, videoId);
        }
      } else {
        const errorMsg = t('common.uploadFailed');
        showToast(errorMsg, "error");
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
    setTitle("");
    setShowForm(false);
    // 清空文件输入框
    const fileInput = document.getElementById(uploadId) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  return (
    <div className="user-video-upload">
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
        title={t('upload.modalTitle')}
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

export default UserVideoUpload;
