import { useLocale } from './LocaleProvider';
import { DEFAULT_LOCALE, type Locale } from './locales';

/**
 * Bind a flat string dict to the current locale. Falls back to English for
 * any missing key, then to the raw key itself — a translation gap degrades
 * to readable (if English) text, never a blank label.
 */
export function useT<T extends Record<string, string>>(dict: Record<Locale, T>) {
  const { locale } = useLocale();
  return (key: keyof T & string): string => {
    return dict[locale]?.[key] ?? dict[DEFAULT_LOCALE]?.[key] ?? key;
  };
}
