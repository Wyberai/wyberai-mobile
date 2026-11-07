import type { Locale } from '../locales';

// Covers components/GoLiveChecklist.tsx. English copy mirrors the web editor's
// GoLiveChecklist. Other locales use the English text until a native review;
// useT falls back to English per key, so nothing ever renders blank.
// {n}/{s}/{count} are literal placeholders the caller replaces.
const en = {
  title: 'Go live: your settings',
  allSaved: 'Everything this app needs is saved. Deploy to put it live with your settings.',
  stillNeed: '{n} service{s} still need your account details. They stay in your own account with each provider, and are only passed to your live app.',
  connected: 'Connected',
  needsSetup: 'Needs setup',
  openProvider: 'Open provider',
  usedByApp: 'Used by your app',
  saveN: 'Save {count} setting{s}',
  saving: 'Saving…',
  savedN: 'Saved {count} setting{s}.',
  couldntSave: "Couldn't save {name}.",
  deploy: 'Deploy with my settings',
  deploying: 'Deploying…',
  deployingMsg: 'Putting your app live with your settings. This takes a minute or two.',
  live: 'Live. Open Publish & Share to point your own domain at it.',
  deployFailed: 'Deploy failed.',
};

export const GO_LIVE_STRINGS: Record<Locale, Record<string, string>> = {
  en,
  hi: { ...en },
  kn: { ...en },
  te: { ...en },
  ta: { ...en },
};
