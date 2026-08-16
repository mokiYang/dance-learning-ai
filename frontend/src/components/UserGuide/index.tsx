import React, { useEffect, useRef, useState } from 'react';
import './index.less';

const GUIDE_STORAGE_KEY = 'danceaura_has_guide';

const hasSeenGuide = () => {
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const rememberGuide = () => {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, '1');
  } catch {
    // The guide can still be closed when storage is unavailable.
  }
};

const UserGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(() => !hasSeenGuide());
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeGuide = () => {
    rememberGuide();
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeGuide();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        className="user-guide-trigger"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="打开新手使用指南"
      >
        <span aria-hidden="true">?</span>
        <span className="user-guide-trigger__text">新手指南</span>
      </button>

      {isOpen && (
        <div
          className="user-guide-mask"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <section
            className="user-guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-guide-title"
            aria-describedby="user-guide-subtitle"
          >
            <button
              ref={closeButtonRef}
              className="user-guide-close"
              type="button"
              onClick={closeGuide}
              aria-label="关闭新手指南"
            >
              ×
            </button>

            <div className="user-guide-heading-icon" aria-hidden="true">✨</div>
            <h2 id="user-guide-title" className="user-guide-title">
              Hello！这里助力你的舞蹈梦想
            </h2>
            <p id="user-guide-subtitle" className="user-guide-subtitle">
              快来解锁超有趣的使用小 Tips
            </p>

            <div className="user-guide-steps">
              <div className="user-guide-step">
                <span aria-hidden="true">01</span>
                <p>初次到访，记得先完成页面顶部的新手入门教程，快速熟悉平台！</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">02</span>
                <p>首页有丰富的舞蹈教学视频。选择喜欢的片段录制，AI 伙伴会给你专属改进建议。</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">03</span>
                <p>点击页面底部的加号，上传想跟拍的舞蹈视频，也可以大胆分享自己的风采。</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">04</span>
                <p>看到其他舞友的精彩作品，别忘了点赞、留言，送上一份暖心鼓励。</p>
              </div>
            </div>

            <p className="user-guide-ending">准备好了吗？开启你的舞蹈成长之旅吧！</p>
            <button className="user-guide-confirm" type="button" onClick={closeGuide}>
              立刻开启
            </button>
          </section>
        </div>
      )}
    </>
  );
};

export default UserGuide;
