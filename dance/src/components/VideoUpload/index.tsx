import React, { useState, forwardRef, useImperativeHandle } from "react";
import { apiService } from "../../services/api";
import "./index.less";

interface VideoUploadProps {
  onUploadSuccess?: () => void;
  onUploadError?: (error: string) => void;
}

export interface VideoUploadRef {
  handleFileUploadClick: () => void;
}

const VideoUpload = forwardRef<VideoUploadRef, VideoUploadProps>(({
  onUploadSuccess,
  onUploadError,
}, ref) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [title, setTitle] = useState("");

  // 生成唯一的ID
  const uploadId = `video-upload-${Math.random().toString(36).substr(2, 9)}`;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("video/")) {
      const errorMsg = "请选择有效的视频文件";
      setUploadError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    // 验证文件大小 (限制为100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      const errorMsg = "文件大小不能超过100MB";
      setUploadError(errorMsg);
      onUploadError?.(errorMsg);
      return;
    }

    setSelectedFile(file);
    setShowForm(true);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const response = await apiService.uploadReferenceVideo(
        selectedFile,
        description,
        author,
        title
      );

      if (response.success) {
        let successMsg = `视频 "${response.filename}" 上传成功！`;
        
        // 显示骨骼数据提取状态
        if (response.pose_data_extracted && response.pose_video_generated) {
          successMsg += ` 骨骼数据和标记骨骼视频已自动生成（${response.pose_frames}帧）`;
        } else if (response.pose_data_extracted) {
          successMsg += ` 骨骼数据已自动提取（${response.pose_frames}帧）`;
        } else if (response.warning) {
          successMsg += ` 注意：${response.warning}`;
        }
        
        setUploadSuccess(successMsg);
        onUploadSuccess?.();
        // 重置表单
        setSelectedFile(null);
        setDescription("");
        setAuthor("");
        setTitle("");
        setShowForm(false);
      } else {
        const errorMsg = "上传失败，请重试";
        setUploadError(errorMsg);
        onUploadError?.(errorMsg);
      }
    } catch (err) {
      console.error("上传失败:", err);
      const errorMsg = "上传失败，请检查网络连接";
      setUploadError(errorMsg);
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

  const handleCancel = () => {
    setSelectedFile(null);
    setDescription("");
    setAuthor("");
    setTitle("");
    setShowForm(false);
    setUploadError(null);
    // 清空文件输入框
    const fileInput = document.getElementById(uploadId) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const clearError = () => {
    setUploadError(null);
  };

  const clearSuccess = () => {
    setUploadSuccess(null);
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

      {!showForm ? (
        /* 上传按钮 */
        <button
          className="upload-button"
          onClick={handleFileUploadClick}
          disabled={uploading}
        >
          <span className="upload-icon">📤</span>
          上传教学视频
        </button>
      ) : (
        /* 上传表单 */
        <div className="upload-form">
          <div className="form-header">
            <h3>上传视频信息</h3>
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
            
            <div className="form-group">
              <label htmlFor="author">作者姓名 *</label>
              <input
                id="author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="请输入作者姓名"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">视频描述</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入视频描述（可选）"
                rows={3}
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
                disabled={uploading || !author.trim() || !title.trim()}
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

      {/* 上传状态提示 */}
      {uploadError && (
        <div className="upload-error">
          <span>❌ {uploadError}</span>
          <button onClick={clearError}>关闭</button>
        </div>
      )}

      {uploadSuccess && (
        <div className="upload-success">
          <span>✅ {uploadSuccess}</span>
          <button onClick={clearSuccess}>关闭</button>
        </div>
      )}
    </div>
  );
});

export default VideoUpload;
