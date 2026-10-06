import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        aria-label={t('guide.open')}
      >
        <span aria-hidden="true">?</span>
        <span className="user-guide-trigger__text">{t('guide.label')}</span>
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
              aria-label={t('guide.close')}
            >
              ×
            </button>

            <div className="user-guide-heading-icon" aria-hidden="true">✨</div>
            <h2 id="user-guide-title" className="user-guide-title">
              {t('guide.title')}
            </h2>
            <p id="user-guide-subtitle" className="user-guide-subtitle">
              {t('guide.subtitle')}
            </p>

            <div className="user-guide-steps">
              <div className="user-guide-step">
                <span aria-hidden="true">01</span>
                <p>{t('guide.step1')}</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">02</span>
                <p>{t('guide.step2')}</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">03</span>
                <p>{t('guide.step3')}</p>
              </div>
              <div className="user-guide-step">
                <span aria-hidden="true">04</span>
                <p>{t('guide.step4')}</p>
              </div>
            </div>

            <p className="user-guide-ending">{t('guide.ending')}</p>
            <button className="user-guide-confirm" type="button" onClick={closeGuide}>
              {t('guide.start')}
            </button>
          </section>
        </div>
      )}
    </>
  );
};

export default UserGuide;
