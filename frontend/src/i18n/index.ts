import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

export const LANGUAGE_STORAGE_KEY = 'danceaura_language';
export const supportedLanguages = ['zh-CN', 'en-US'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

const normalizeLanguage = (language?: string | null): SupportedLanguage =>
  language?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';

const getInitialLanguage = (): SupportedLanguage => {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved) return normalizeLanguage(saved);
  } catch {
    // Browser preferences still provide a sensible fallback when storage is unavailable.
  }
  return normalizeLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
};

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: supportedLanguages,
  interpolation: { escapeValue: false },
});

const applyLanguage = (language: string) => {
  const normalized = normalizeLanguage(language);
  document.documentElement.lang = normalized;
  document.title = i18n.t('app.title');
  let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!description) {
    description = document.createElement('meta');
    description.name = 'description';
    document.head.appendChild(description);
  }
  description.content = i18n.t('app.description');
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Changing language should still work when storage is unavailable.
  }
};

applyLanguage(i18n.language);
i18n.on('languageChanged', applyLanguage);

export default i18n;
