import type { Locale } from '../locales';

// AI-drafted, not yet native-reviewed. Covers app/(app)/code/[id].tsx.
// {n}/{size} are literal placeholders the caller replaces.
export const CODE_SCREEN_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    code: 'Code',
    files: 'Files',
    back: 'Back',
    noCodeYet: 'No code yet',
    buildFirstBody: 'Build something first — the source shows up here.',
    filesSummary: '{n} files · every line written by AI, owned by you',
    root: 'root',
    linesAndSize: '{n} lines · {size}',
  },
  hi: {
    code: 'कोड',
    files: 'फ़ाइलें',
    back: 'वापस',
    noCodeYet: 'अभी कोई कोड नहीं',
    buildFirstBody: 'पहले कुछ बनाएं — सोर्स यहां दिखेगा।',
    filesSummary: '{n} फ़ाइलें · हर लाइन AI द्वारा लिखी गई, आपकी मिल्कियत',
    root: 'रूट',
    linesAndSize: '{n} लाइनें · {size}',
  },
  kn: {
    code: 'ಕೋಡ್',
    files: 'ಫೈಲ್‌ಗಳು',
    back: 'ಹಿಂದೆ',
    noCodeYet: 'ಇನ್ನೂ ಯಾವುದೇ ಕೋಡ್ ಇಲ್ಲ',
    buildFirstBody: 'ಮೊದಲು ಏನನ್ನಾದರೂ ನಿರ್ಮಿಸಿ — ಸೋರ್ಸ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
    filesSummary: '{n} ಫೈಲ್‌ಗಳು · ಪ್ರತಿ ಸಾಲನ್ನೂ AI ಬರೆದಿದೆ, ನಿಮ್ಮ ಸ್ವಂತ',
    root: 'ರೂಟ್',
    linesAndSize: '{n} ಸಾಲುಗಳು · {size}',
  },
  te: {
    code: 'కోడ్',
    files: 'ఫైల్‌లు',
    back: 'వెనుకకు',
    noCodeYet: 'ఇంకా కోడ్ లేదు',
    buildFirstBody: 'ముందుగా ఏదైనా నిర్మించండి — సోర్స్ ఇక్కడ కనిపిస్తుంది.',
    filesSummary: '{n} ఫైల్‌లు · ప్రతి లైన్ AI చేత వ్రాయబడింది, మీ సొంతం',
    root: 'రూట్',
    linesAndSize: '{n} లైన్‌లు · {size}',
  },
  ta: {
    code: 'குறியீடு',
    files: 'கோப்புகள்',
    back: 'பின்செல்',
    noCodeYet: 'இன்னும் குறியீடு இல்லை',
    buildFirstBody: 'முதலில் ஏதாவது உருவாக்குங்கள் — மூலம் இங்கே தோன்றும்.',
    filesSummary: '{n} கோப்புகள் · ஒவ்வொரு வரியும் AI ஆல் எழுதப்பட்டது, உங்கள் சொந்தம்',
    root: 'ரூட்',
    linesAndSize: '{n} வரிகள் · {size}',
  },
};
