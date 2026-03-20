import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';
import ja from './locales/ja.json';

export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'ja';

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export const DEFAULT_LOCALE: Locale = 'zh-TW';

const messages: Record<Locale, Record<string, string>> = {
  en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  ja,
};

export function getMessages(locale: Locale): Record<string, string> {
  return messages[locale] ?? messages[DEFAULT_LOCALE];
}

/**
 * Translate a key with optional interpolation.
 * Usage: translate(messages, 'signoff.progress', { signed: 2, total: 5 })
 */
export function translate(
  msgs: Record<string, string>,
  key: string,
  params?: Record<string, string | number>,
): string {
  let text = msgs[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
