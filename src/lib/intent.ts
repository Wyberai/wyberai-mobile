/**
 * Builder intent classifier.
 *
 * Ported verbatim from the web app (src/lib/intent.ts). The builder used to
 * treat EVERY chat message as a build: it charged credits, showed a build
 * loader, and ran the full code-generation prompt — even for a plain
 * question like "is it done?" or "what does this do?". This module routes
 * a message into one of three buckets BEFORE any build work happens:
 *
 *   - CHAT  — questions, confirmations, greetings, thanks. No code, no charge.
 *   - EDIT  — a change to an existing app ("add a settings page", "make it dark").
 *   - BUILD — a net-new app (no files yet, or "rebuild as…").
 *
 * AMBIGUOUS means the cheap heuristic isn't confident; the caller should defer
 * to the Haiku fallback in /api/assist (sub-cent, never charged to the user).
 *
 * Heuristic only — keep it dependency-free so it can run on the client.
 * Keep in sync with the web original; drift here would mean mobile and web
 * charge differently for the identical message.
 */

export type Intent = 'CHAT' | 'EDIT' | 'BUILD' | 'AMBIGUOUS'

// Imperative action verbs that signal the user wants the app changed/built.
const ACTION_VERBS = new Set([
  'add', 'change', 'make', 'remove', 'delete', 'update', 'fix', 'create',
  'build', 'rebuild', 'implement', 'move', 'rename', 'set', 'replace', 'style',
  'center', 'centre', 'align', 'connect', 'integrate', 'refactor', 'redesign',
  'adjust', 'put', 'insert', 'swap', 'wire', 'convert', 'generate', 'design',
  'improve', 'enhance', 'tweak', 'modify', 'edit', 'increase', 'decrease',
  'resize', 'reposition', 'use', 'give', 'show', 'hide', 'enable', 'disable',
  'turn', 'apply', 'fill', 'split', 'merge', 'reorder', 'sort', 'group',
  'animate', 'round', 'pad', 'shrink', 'expand', 'darken', 'lighten', 'recolor',
])

// Confirmations / greetings / status checks — always conversational.
const CHAT_RE = /^(thanks|thank you|thx|ty|ok|okay|kk|cool|nice|great|perfect|awesome|amazing|love it|looks good|lgtm|got it|good|done\??|is it (done|working|ready|finished)|does (it|this) work|did (it|that) work|what('?s| is) next|what now|whats next|hi|hello|hey|yo|sup|why (isn'?t|isnt|won'?t|wont|doesn'?t|doesnt)|cheers|nevermind|never mind|no thanks)\b/i

// A leading question word.
const QUESTION_START_RE = /^(what|why|how|is|are|can|could|would|should|do|does|did|will|when|where|who|which|whom|whose|am|may|might|got|have|has|was|were)\b/i

// Polite-imperative: "can you add…", "please make…", "could you fix…".
const POLITE_IMPERATIVE_RE = /^(can|could|would|will|please|pls)\s+(you\s+)?(also\s+|now\s+|just\s+|then\s+)?([a-z]+)/i

/**
 * Classify a single user message. `hasFiles` = the project already has code.
 */
export function classifyIntent(rawMsg: string, hasFiles: boolean): Intent {
  const msg = (rawMsg || '').trim()
  if (!msg) return hasFiles ? 'AMBIGUOUS' : 'BUILD'

  const lower = msg.toLowerCase()
  const words = lower.split(/\s+/)
  const firstWord = words[0].replace(/[^a-z]/g, '')
  const endsQuestion = msg.endsWith('?')

  // 1. Explicit confirmations / greetings → always chat.
  if (CHAT_RE.test(lower)) return 'CHAT'

  // 2. Direct imperative ("add a button", "fix the header").
  const action = hasFiles ? 'EDIT' : 'BUILD'
  if (ACTION_VERBS.has(firstWord)) return action

  // 3. Polite imperative ("can you add…", "please make…").
  const polite = lower.match(POLITE_IMPERATIVE_RE)
  if (polite && ACTION_VERBS.has(polite[4])) return action

  // 4. Questions (after imperatives, so "what does X do?" → chat,
  //    but "can you add X?" already routed to action above).
  if (endsQuestion || QUESTION_START_RE.test(lower)) return 'CHAT'

  if (!hasFiles) {
    // No files and not a question → treat as the first build prompt.
    return 'BUILD'
  }

  // 5. Files exist, no clear signal.
  //    An action verb anywhere in the sentence → lean edit.
  if (words.some(w => ACTION_VERBS.has(w.replace(/[^a-z]/g, '')))) return 'EDIT'
  //    Anything else short and verbless ("the footer", "go ahead", "yes
  //    please") could be a stray comment or a bare confirmation of
  //    something the assistant just proposed — the client can't tell
  //    which without the prior turn, so defer to the server's Haiku
  //    check (which sees history) instead of hard-coding CHAT here.
  return 'AMBIGUOUS'
}
