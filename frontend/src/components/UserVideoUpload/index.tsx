import React, { useState, forwardRef, useImperativeHandle } from "react";
import { apiService } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { showToast } from "../Toast/ToastContainer";
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
      const errorMsg = "请选择有效的视频文件";
      showToast(errorMsg, "error");
      onUploadError?.(errorMsg);
      return;
    }

    // 验证文件大小 (限制为100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      const errorMsg = "文件大小不能超过100MB";
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
      showToast("请输入视频标题", "error");
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
            `视频 "${response.filename}" 上传成功！`,
            "success",
            3000
          );
          
          onUploadSuccess?.(taskId, videoId);
        } else {
          // 没有task_id，使用旧的同步模式
          showToast(`视频 "${response.filename}" 上传成功！`, "success", 2000);
          
          onUploadSuccess?.(undefined, videoId);
        }
      } else {
        const errorMsg = "上传失败，请重试";
        showToast(errorMsg, "error");
        onUploadError?.(errorMsg);
      }
    } catch (err) {
      console.error("上传失败:", err);
      const errorMsg = "上传失败，请检查网络连接";
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
      {showForm && (
        <div className="upload-form">
          <div className="form-header">
            <h3>投稿</h3>
            <button className="close-button" onClick={handleCancel}>
              ×
            </button>
          </div>

          <div className="form-content">
            <div className="file-info">
              <span className="file-name">📹 {selectedFile?.name}</span>
            </div>
            
            <div className="form-group">
              <label htmlFor="title">视频标题 *</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="请输入视频标题"
                required
              />
            </div>
            
            <div className="form-actions">
              <button
                className="cancel-button"
                onClick={handleCancel}
                disabled={uploading}
              >
                取消
              </button>
              <button
                className="submit-button"
                onClick={handleUpload}
                disabled={uploading || !title.trim()}
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
          </div>
        </div>
      )}
    </div>
  );
});

export default UserVideoUpload;

