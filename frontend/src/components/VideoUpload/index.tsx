import React, { useState, forwardRef, useImperativeHandle } from "react";
import { apiService } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { showToast } from "../Toast/ToastContainer";
import UploadFormModal from "../UploadFormModal";
import "./index.less";

interface VideoUploadProps {
  onUploadSuccess?: (taskId?: string, videoId?: string) => void;
  onUploadError?: (error: string) => void;
}

export interface VideoUploadRef {
  handleFileUploadClick: () => void;
}

const VideoUpload = forwardRef<VideoUploadRef, VideoUploadProps>(({
  onUploadSuccess,
  onUploadError,
}, ref) => {
  const { user } = useAuth(); // 获取当前登录用户
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [title, setTitle] = useState("");
  const [isTeachingVideo, setIsTeachingVideo] = useState(true); // 默认为教学视频

  // 生成唯一的ID
  const uploadId = `video-upload-${Math.random().toString(36).substring(2, 11)}`;

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

    setUploading(true);

    try {
      // 使用当前登录用户的用户名作为作者
      const authorName = user?.username || author || "匿名用户";
      
      let response;
      
      if (isTeachingVideo) {
        // 作为教学视频发布：需要提取骨骼
        response = await apiService.uploadReferenceVideo(
          selectedFile,
          description,
          authorName,
          title
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
        const filename = response.filename || selectedFile?.name || '视频';
        
        // 先关闭表单，再显示 Toast（确保 Toast 不被表单遮挡）
        setSelectedFile(null);
        setDescription("");
        setAuthor("");
        setTitle("");
        setIsTeachingVideo(true); // 重置为默认值
        setShowForm(false);
        
        // 延迟一下显示 Toast，确保表单已关闭
        setTimeout(() => {
          const videoType = isTeachingVideo ? "教学视频" : "用户视频";
          if (taskId) {
            // 有异步任务，显示全局成功提示
            showToast(
              `${videoType} "${filename}" 上传成功！`,
              "success",
              3000
            );
          } else {
            // 没有task_id，使用旧的同步模式
            showToast(`${videoType} "${filename}" 上传成功！`, "success", 2000);
          }
        }, 100);
        
        onUploadSuccess?.(taskId, videoId);
      } else {
        const errorMsg = (response as any).error || response.message || "上传失败，请重试";
        // 先关闭表单，再显示错误 Toast
        setShowForm(false);
        setTimeout(() => {
          showToast(errorMsg, "error");
        }, 100);
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
        title="上传视频信息"
        fileName={selectedFile?.name}
        onClose={handleCancel}
      >
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
          <label htmlFor="description">视频描述</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请输入视频描述（可选）"
            rows={3}
          />
        </div>
        
        <div className="form-group">
          <label className="video-type-label">视频类型 *</label>
          <div className="video-type-selector">
            <div
              className={`video-type-option ${isTeachingVideo ? 'active' : ''}`}
              onClick={() => setIsTeachingVideo(true)}
            >
              <div className="option-icon">📚</div>
              <div className="option-content">
                <div className="option-title">教学视频</div>
                <div className="option-desc">将进行骨骼提取，可用于姿势对比</div>
              </div>
              {isTeachingVideo && <div className="option-check">✓</div>}
            </div>
            <div
              className={`video-type-option ${!isTeachingVideo ? 'active' : ''}`}
              onClick={() => setIsTeachingVideo(false)}
            >
              <div className="option-icon">👤</div>
              <div className="option-content">
                <div className="option-title">用户视频</div>
                <div className="option-desc">直接上传，不进行骨骼提取</div>
              </div>
              {!isTeachingVideo && <div className="option-check">✓</div>}
            </div>
          </div>
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
      </UploadFormModal>
    </div>
  );
});

export default VideoUpload;
