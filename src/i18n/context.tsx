'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Locale } from './index';
import { DEFAULT_LOCALE, getMessages, translate } from './index';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = localStorage.getItem('locale') as Locale | null;
  if (stored && ['en', 'zh-TW', 'zh-CN', 'ja'].includes(stored)) return stored;
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const msgs = getMessages(locale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    document.documentElement.lang = newLocale === 'zh-TW' ? 'zh-Hant' : newLocale === 'zh-CN' ? 'zh-Hans' : newLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh-TW' ? 'zh-Hant' : locale === 'zh-CN' ? 'zh-Hans' : locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(msgs, key, params),
    [msgs],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
