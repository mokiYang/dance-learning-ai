import React from "react";
import "./index.less";

export interface UploadFormModalProps {
  visible: boolean;
  title: string;
  fileName?: string;
  children: React.ReactNode;
  onClose: () => void;
  showOverlay?: boolean; // 是否显示遮罩层
}

const UploadFormModal: React.FC<UploadFormModalProps> = ({
  visible,
  title,
  fileName,
  children,
  onClose,
  showOverlay = false,
}) => {
  if (!visible) return null;

  const content = (
    <div className="upload-form" onClick={(e) => e.stopPropagation()}>
      <div className="form-header">
        <h3>{title}</h3>
        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="form-content">
        {fileName && (
          <div className="file-info">
            <span className="file-name">📹 {fileName}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (showOverlay) {
    return (
      <div className="upload-form-overlay" onClick={onClose}>
        {content}
      </div>
    );
  }

  return content;
};

export default UploadFormModal;

