import type { Locale } from '../locales';

// AI-drafted, not yet native-reviewed. Covers the tab bar labels in
// app/(app)/_layout.tsx — the one place react-navigation needs plain string
// titles rather than JSX, so these never went through the earlier per-screen
// dicts (which cover in-screen content, not the native tab bar/header chrome).
export const TABS_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    home: 'Home',
    projects: 'Projects',
    activity: 'Activity',
    account: 'Account',
  },
  hi: {
    home: 'होम',
    projects: 'प्रोजेक्ट्स',
    activity: 'एक्टिविटी',
    account: 'अकाउंट',
  },
  kn: {
    home: 'ಹೋಮ್',
    projects: 'ಪ್ರಾಜೆಕ್ಟ್‌ಗಳು',
    activity: 'ಚಟುವಟಿಕೆ',
    account: 'ಖಾತೆ',
  },
  te: {
    home: 'హోమ్',
    projects: 'ప్రాజెక్ట్‌లు',
    activity: 'యాక్టివిటీ',
    account: 'ఖాతా',
  },
  ta: {
    home: 'முகப்பு',
    projects: 'திட்டங்கள்',
    activity: 'செயல்பாடு',
    account: 'கணக்கு',
  },
};
