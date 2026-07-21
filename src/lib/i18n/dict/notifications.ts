import type { Locale } from '../locales';

// AI-drafted, not yet native-reviewed. Notification body text (bodyOf in
// notifications.tsx) is server-stored payload data, not UI chrome — it stays
// as the server wrote it regardless of locale.
export const NOTIFICATIONS_STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    allCaughtUp: "You're all caught up",
    emptyBody: 'Build, publish, and referral activity will appear here.',
    scheduledAgentRan: 'Scheduled agent ran',
    scheduledAgentSkipped: 'Scheduled agent skipped',
    buildComplete: 'Build complete',
    projectPublished: 'Project published',
    referralReward: 'Referral reward',
  },
  hi: {
    allCaughtUp: 'आप पूरी तरह अपडेट हैं',
    emptyBody: 'बिल्ड, पब्लिश, और रेफ़रल गतिविधि यहां दिखेगी।',
    scheduledAgentRan: 'शेड्यूल्ड एजेंट चला',
    scheduledAgentSkipped: 'शेड्यूल्ड एजेंट छोड़ दिया गया',
    buildComplete: 'बिल्ड पूरा हुआ',
    projectPublished: 'प्रोजेक्ट पब्लिश हुआ',
    referralReward: 'रेफ़रल रिवॉर्ड',
  },
  kn: {
    allCaughtUp: 'ನೀವು ಸಂಪೂರ್ಣವಾಗಿ ಅಪ್‌ಡೇಟ್ ಆಗಿದ್ದೀರಿ',
    emptyBody: 'ಬಿಲ್ಡ್, ಪ್ರಕಟಣೆ ಮತ್ತು ರೆಫರಲ್ ಚಟುವಟಿಕೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
    scheduledAgentRan: 'ಶೆಡ್ಯೂಲ್ ಮಾಡಿದ ಏಜೆಂಟ್ ಚಾಲನೆಯಾಯಿತು',
    scheduledAgentSkipped: 'ಶೆಡ್ಯೂಲ್ ಮಾಡಿದ ಏಜೆಂಟ್ ಬಿಟ್ಟುಬಿಡಲಾಗಿದೆ',
    buildComplete: 'ಬಿಲ್ಡ್ ಪೂರ್ಣಗೊಂಡಿದೆ',
    projectPublished: 'ಪ್ರಾಜೆಕ್ಟ್ ಪ್ರಕಟಿಸಲಾಗಿದೆ',
    referralReward: 'ರೆಫರಲ್ ರಿವಾರ್ಡ್',
  },
  te: {
    allCaughtUp: 'మీరు పూర్తిగా అప్‌డేట్‌గా ఉన్నారు',
    emptyBody: 'బిల్డ్, ప్రచురణ, మరియు రెఫరల్ కార్యకలాపం ఇక్కడ కనిపిస్తుంది.',
    scheduledAgentRan: 'షెడ్యూల్ చేసిన ఏజెంట్ నడిచింది',
    scheduledAgentSkipped: 'షెడ్యూల్ చేసిన ఏజెంట్ దాటవేయబడింది',
    buildComplete: 'బిల్డ్ పూర్తయింది',
    projectPublished: 'ప్రాజెక్ట్ ప్రచురించబడింది',
    referralReward: 'రెఫరల్ రివార్డ్',
  },
  ta: {
    allCaughtUp: 'நீங்கள் முழுமையாக புதுப்பித்துவிட்டீர்கள்',
    emptyBody: 'பில்ட், வெளியீடு, மற்றும் பரிந்துரை செயல்பாடு இங்கே தோன்றும்.',
    scheduledAgentRan: 'திட்டமிடப்பட்ட ஏஜென்ட் இயங்கியது',
    scheduledAgentSkipped: 'திட்டமிடப்பட்ட ஏஜென்ட் தவிர்க்கப்பட்டது',
    buildComplete: 'பில்ட் முடிந்தது',
    projectPublished: 'திட்டம் வெளியிடப்பட்டது',
    referralReward: 'பரிந்துரை வெகுமதி',
  },
};
