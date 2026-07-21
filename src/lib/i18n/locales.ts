// Mirrors the web app's src/lib/i18n/locales.ts — same locale set, same
// storage-key convention — so translators and future maintainers only have
// to learn this shape once.

export const LOCALES = ['en', 'hi', 'kn', 'te', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
  kn: 'ಕನ್ನಡ',
  te: 'తెలుగు',
  ta: 'தமிழ்',
};

export const DEFAULT_LOCALE: Locale = 'en';

// AsyncStorage key — mobile's equivalent of web's localStorage key.
export const LOCALE_STORAGE_KEY = 'wyber-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
