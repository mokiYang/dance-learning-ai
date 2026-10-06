import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '../../i18n';
import './index.less';

const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation();
  const activeLanguage: SupportedLanguage = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'zh-CN';

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  return (
    <div className="language-switcher" role="group" aria-label={t('language.selector')}>
      <span className="language-switcher__icon" aria-hidden="true">🌐</span>
      <span className="language-switcher__label">{t('language.label')}</span>
      {(['zh-CN', 'en-US'] as const).map((language) => (
        <button
          key={language}
          type="button"
          className={`language-switcher__option ${activeLanguage === language ? 'is-active' : ''}`}
          onClick={() => changeLanguage(language)}
          aria-pressed={activeLanguage === language}
        >
          {t(language === 'zh-CN' ? 'language.chinese' : 'language.english')}
        </button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
