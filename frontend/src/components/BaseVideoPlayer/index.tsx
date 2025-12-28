import React, { useRef } from 'react';
import './index.less';

export interface ControlButton {
  label: string | React.ReactNode;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
  visible?: boolean;
}

export interface BaseVideoPlayerProps {
  videoSrc?: string; // 可选，如果提供 customVideo 则不需要
  poster?: string;
  onBack: () => void;
  rightButtons?: ControlButton[];
  children?: React.ReactNode; // 用于自定义内容（如摄像头视频、倒计时等）
  loading?: boolean;
  error?: string | null;
  onError?: () => void;
  videoProps?: React.VideoHTMLAttributes<HTMLVideoElement>; // 额外的video属性
  customVideo?: React.ReactNode; // 自定义视频元素，如果提供则使用此而不是默认视频
}

const BaseVideoPlayer: React.FC<BaseVideoPlayerProps> = ({
  videoSrc,
  poster,
  onBack,
  rightButtons = [],
  children,
  loading = false,
  error = null,
  onError,
  videoProps = {},
  customVideo,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (loading) {
    return (
      <div className="video-player-container">
        <div className="loading-container">
          <div className="loading-spinner">加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-player-container">
        <div className="error-container">
          <div className="error-message">{error}</div>
          <button className="btn btn-primary" onClick={onBack}>
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="video-player-container">
      <div className="controls">
        <button className="btn-back" onClick={onBack}>
          ←
        </button>
        
        {rightButtons.length > 0 && (
          <div className="controls-right">
            {rightButtons
              .filter(btn => btn.visible !== false)
              .map((btn, index) => (
                <button
                  key={index}
                  className={`btn-action ${btn.className || ''}`}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                >
                  {btn.label}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="video-layout">
        {customVideo ? (
          customVideo
        ) : (
          <div className="video-wrapper as-main">
            <video
              ref={videoRef}
              className="video-element"
              src={videoSrc}
              poster={poster}
              controls
              preload="metadata"
              playsInline
              onError={onError}
              {...videoProps}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default BaseVideoPlayer;

