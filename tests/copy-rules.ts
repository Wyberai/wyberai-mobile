// Mirror of the web repo's src/lib/customer-copy-rules.ts BANNED_COPY. Keep in sync: same founder rules for anything a customer reads.
export const BANNED_COPY: [RegExp, string][] = [
  [/connection (dropped|lost|was interrupted)|interrupted your build/i, 'narrates a dropped connection'],
  [/retrying automatically|retry(ing)? (it )?for you/i, 'narrates an internal retry'],
  [/\bwi-?fi\b|computer (sleeps|slept)/i, "blames the user's device/network"],
  [/something went wrong|is broken|went haywire/i, 'announces a failure'],
  [/(was|were|still) missing|missing (pieces|files?|components?)|never (written|emitted)|remaining (files|parts|pieces)/i, 'narrates missing pieces'],
  // Any "I haven't (yet) run / tested / opened / checked / looked at …" —
  // live: "I haven't opened the preview to check it yet" slipped past a
  // narrower run|tested-only pattern.
  // First person only, so "the dialog didn't open on mobile — fixed" survives.
  [/\bI (haven'?t|have not|didn'?t|did not)( yet)? (run|test|tested|open|opened|check|checked|verify|verified|look|looked|preview|previewed|tried)\b|\buntested\b|not (been )?(tested|verified|checked)( it)? yet|without (testing|running|checking) it/i, 'claims the work is untested'],
]
