// Ported verbatim from the web app (src/lib/chat-history-window.ts).
//
// Prompt-caching only works when consecutive requests share an identical
// prefix. A plain `.slice(-N)` on a growing conversation shifts by one message
// every turn — the oldest kept message changes every time, so the cache
// prefix hash never matches twice past the first N/2 exchanges.
//
// This keeps a STABLE, GROWING window instead: once the conversation exceeds
// ANCHOR messages, the start index only advances in blocks of CYCLE, so for
// long stretches the window grows by appending (perfect for caching) and only
// resets — a one-time cache miss — every CYCLE turns.
const ANCHOR = 10
const CYCLE = 10

export function windowedHistory<T>(items: T[]): T[] {
  const start = Math.max(0, Math.floor((items.length - ANCHOR) / CYCLE) * CYCLE)
  return items.slice(start)
}
