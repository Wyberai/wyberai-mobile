import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from './locales';

const LocaleCtx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; ready: boolean }>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  ready: false,
});

// App-wide locale context. Unlike the web app (which has to dodge SSR/static-
// generation concerns), there's no server render here — AsyncStorage is read
// once on mount and the picked locale just applies immediately, no separate
// reconciliation step to get wrong.
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (isLocale(stored)) setLocaleState(stored);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, l).catch(() => {});
  };

  return <LocaleCtx.Provider value={{ locale, setLocale, ready }}>{children}</LocaleCtx.Provider>;
}

export const useLocale = () => useContext(LocaleCtx);
