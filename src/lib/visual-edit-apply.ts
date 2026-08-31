// Ported verbatim from the web app (src/lib/visual-edit-apply.ts).
//
// The LLM-free path for "tap an element, change it": the preview bridge
// reports data-wyber-loc="path:line" for the tapped element; these pure
// functions map that back onto the saved source and rewrite it directly.
// Loc-based first, unique-string fallback second, honest failure third (the
// caller then offers the paid AI-edit lane instead of guessing).

type FileVal = { content?: string; language?: string; path?: string } | string

export interface ApplyResult<T> {
  ok: boolean
  files: T
  /** file actually modified (when ok) */
  path?: string
}

const fileContent = (v: FileVal | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.content ?? '')

const withContent = (v: FileVal, content: string): FileVal =>
  typeof v === 'string' ? content : { ...v, content }

/** "src/App.tsx:42" → { path, line } (1-indexed). */
export function parseLoc(loc: string | null | undefined): { path: string; line: number } | null {
  if (!loc) return null
  const at = loc.lastIndexOf(':')
  if (at <= 0) return null
  const line = parseInt(loc.slice(at + 1), 10)
  const path = loc.slice(0, at)
  if (!path || !Number.isFinite(line) || line < 1) return null
  return { path, line }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0, i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) { n++; i += needle.length }
  return n
}

/** Replace exactly one occurrence inside a line window around `line` (1-indexed). */
function replaceInWindow(src: string, line: number, needle: string, replacement: string, windowAfter = 6): string | null {
  const lines = src.split('\n')
  const from = Math.max(0, line - 2)
  const to = Math.min(lines.length, line + windowAfter)
  for (let i = from; i < to; i++) {
    const at = lines[i].indexOf(needle)
    if (at !== -1) {
      lines[i] = lines[i].slice(0, at) + replacement + lines[i].slice(at + needle.length)
      return lines.join('\n')
    }
  }
  return null
}

/**
 * Change an element's visible text. Resolution order:
 *   1. loc's file, within a small line window around loc
 *   2. loc's file anywhere, if oldText is unique there
 *   3. any file where oldText is unique (loc missing/stale)
 * Never guesses: ambiguous or absent text → ok:false, files untouched.
 */
export function applyTextEdit<T extends Record<string, FileVal>>(
  files: T, loc: string | null | undefined, oldText: string, newText: string
): ApplyResult<T> {
  const needle = (oldText ?? '').trim()
  if (!needle || newText == null || needle === newText.trim()) return { ok: false, files }

  const parsed = parseLoc(loc)
  if (parsed && files[parsed.path] !== undefined) {
    const src = fileContent(files[parsed.path])
    const windowed = replaceInWindow(src, parsed.line, needle, newText)
    if (windowed !== null) {
      return { ok: true, files: { ...files, [parsed.path]: withContent(files[parsed.path], windowed) }, path: parsed.path }
    }
    if (countOccurrences(src, needle) === 1) {
      return { ok: true, files: { ...files, [parsed.path]: withContent(files[parsed.path], src.replace(needle, newText)) }, path: parsed.path }
    }
  }

  // Unique-string fallback across all source files.
  let foundPath: string | null = null
  for (const [path, val] of Object.entries(files)) {
    if (!/\.(tsx|jsx|ts|js|html)$/.test(path)) continue
    const n = countOccurrences(fileContent(val), needle)
    if (n === 0) continue
    if (n > 1 || foundPath) return { ok: false, files } // ambiguous — refuse to guess
    foundPath = path
  }
  if (!foundPath) return { ok: false, files }
  const src = fileContent(files[foundPath])
  return { ok: true, files: { ...files, [foundPath]: withContent(files[foundPath], src.replace(needle, newText)) }, path: foundPath }
}

/**
 * Swap an element's full className value (the inspector computes the new
 * string locally with the token helpers below). Loc-window first, then
 * unique-in-file, then unique-across-files.
 */
export function applyClassEdit<T extends Record<string, FileVal>>(
  files: T, loc: string | null | undefined, oldClassName: string, newClassName: string
): ApplyResult<T> {
  const oldAttr = `className="${oldClassName}"`
  const newAttr = `className="${newClassName}"`
  if (!oldClassName || oldClassName === newClassName) return { ok: false, files }

  const parsed = parseLoc(loc)
  if (parsed && files[parsed.path] !== undefined) {
    const src = fileContent(files[parsed.path])
    const windowed = replaceInWindow(src, parsed.line, oldAttr, newAttr, 8)
    if (windowed !== null) {
      return { ok: true, files: { ...files, [parsed.path]: withContent(files[parsed.path], windowed) }, path: parsed.path }
    }
    if (countOccurrences(src, oldAttr) === 1) {
      return { ok: true, files: { ...files, [parsed.path]: withContent(files[parsed.path], src.replace(oldAttr, newAttr)) }, path: parsed.path }
    }
  }

  let foundPath: string | null = null
  for (const [path, val] of Object.entries(files)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    const n = countOccurrences(fileContent(val), oldAttr)
    if (n === 0) continue
    if (n > 1 || foundPath) return { ok: false, files }
    foundPath = path
  }
  if (!foundPath) return { ok: false, files }
  const src = fileContent(files[foundPath])
  return { ok: true, files: { ...files, [foundPath]: withContent(files[foundPath], src.replace(oldAttr, newAttr)) }, path: foundPath }
}

// ── Token-aware Tailwind class-string helpers ──────────────────────────────

// Ordered scales for the inspector's steppers. Prefix families: the current
// token is whichever scale entry the class list contains.
const SCALES: Record<string, string[]> = {
  'text-size': ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'],
  p: ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-10', 'p-12', 'p-16'],
  px: ['px-0', 'px-1', 'px-2', 'px-3', 'px-4', 'px-5', 'px-6', 'px-8', 'px-10', 'px-12'],
  py: ['py-0', 'py-1', 'py-2', 'py-3', 'py-4', 'py-5', 'py-6', 'py-8', 'py-10', 'py-12'],
  gap: ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-5', 'gap-6', 'gap-8', 'gap-10', 'gap-12'],
  rounded: ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'],
}

export type StepFamily = keyof typeof SCALES

// Sensible starting point when the element has no explicit token yet.
const SCALE_DEFAULT_INDEX: Record<string, number> = {
  'text-size': 2, p: 4, px: 4, py: 2, gap: 3, rounded: 3,
}

const tokens = (classStr: string) => (classStr ?? '').trim().split(/\s+/).filter(Boolean)

/**
 * Step a size family up/down one notch within its scale. Missing token →
 * starts from the family default. Clamped at scale ends (returns the same
 * string when already at the edge and stepping outward).
 */
export function stepClass(classStr: string, family: StepFamily, dir: 1 | -1): string {
  const scale = SCALES[family]
  const list = tokens(classStr)
  const idx = list.findIndex(t => scale.includes(t))
  if (idx === -1) {
    const start = Math.min(scale.length - 1, Math.max(0, SCALE_DEFAULT_INDEX[family] + dir))
    return [...list, scale[start]].join(' ')
  }
  const cur = scale.indexOf(list[idx])
  const next = Math.min(scale.length - 1, Math.max(0, cur + dir))
  list[idx] = scale[next]
  return list.join(' ')
}

// Semantic color tokens (design-system contract) the inspector offers.
export const SEMANTIC_COLOR_TOKENS = [
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'accent', 'accent-foreground', 'muted', 'muted-foreground',
  'destructive', 'destructive-foreground', 'foreground', 'background',
  'card', 'card-foreground', 'border', 'transparent', 'white', 'black',
] as const

// A `<prop>-<something>` class is a COLOR class when <something> is a
// semantic token, a tailwind palette color (red-500), or an arbitrary value —
// but for text-*, never a size/weight/alignment token.
const TEXT_NON_COLOR = new Set([
  ...SCALES['text-size'],
  'text-left', 'text-center', 'text-right', 'text-justify', 'text-ellipsis', 'text-clip',
  'text-wrap', 'text-nowrap', 'text-balance', 'text-pretty',
])
const TW_PALETTE = /^(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?$/

function isColorValue(value: string): boolean {
  return (SEMANTIC_COLOR_TOKENS as readonly string[]).includes(value)
    || TW_PALETTE.test(value)
    || /^\[.*\]$/.test(value)
}

/**
 * Set an element's semantic color for a property ('text' | 'bg' | 'border'),
 * removing any existing color class of that property (but never text sizes,
 * alignment, border widths, etc.).
 */
export function setColorClass(classStr: string, prop: 'text' | 'bg' | 'border', token: string): string {
  const list = tokens(classStr).filter(t => {
    if (!t.startsWith(prop + '-')) return true
    if (prop === 'text' && TEXT_NON_COLOR.has(t)) return true
    if (prop === 'border' && /^border-(?:\d|t\b|b\b|l\b|r\b|x\b|y\b|solid|dashed|dotted|none)/.test(t)) return true
    return !isColorValue(t.slice(prop.length + 1))
  })
  list.push(`${prop}-${token}`)
  return list.join(' ')
}
