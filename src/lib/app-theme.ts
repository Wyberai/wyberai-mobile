// App-theme read/write — Session C owns this file.
//
// A generated app's theme is nothing but the shadcn-style token values in its
// src/index.css :root{} block (see design-system.ts for the contract). That
// file lives inside projects.files (jsonb), so retheming an app is a pure
// string rewrite + normal project save: 0 LLM credits, no rebuild round-trip
// needed for preview (the bridge's wyber-apply-theme upserts a <style> tag
// instantly), and publish parity is automatic because index.css IS the
// publish source.

import type { Palette } from './design-palettes'

export interface AppTheme {
  /** token name (without --) → HSL channels, e.g. { primary: "199 89% 48%" } */
  tokens: Record<string, string>
  radius?: string
  fontSans?: string
  fontDisplay?: string
  fontMono?: string
}

// Color tokens the panel edits/serializes, in canonical order.
export const COLOR_TOKENS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
] as const

// Curated faces — must stay a subset of design-system.ts GOOGLE_FONTS_LINKS
// (every one of these loads in every preview and published app).
export const CURATED_FONTS = {
  sans: ['Switzer', 'General Sans'],
  display: ['General Sans', 'Instrument Serif', 'Fraunces', 'Playfair Display', 'Lora', 'Switzer'],
} as const

const strip = (v: string) => v.trim().replace(/^['"]|['"]$/g, '')

/** Extract the first `:root { … }` block's body, with its span in the source. */
function rootBlock(css: string): { body: string; start: number; end: number } | null {
  const m = css.match(/:root\s*\{/)
  if (!m || m.index === undefined) return null
  const open = m.index + m[0].length
  let depth = 1
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) {
      return { body: css.slice(open, i), start: m.index, end: i + 1 }
    }
  }
  return null
}

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]?/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

/** Read the app's theme out of its src/index.css. Missing block → empty theme. */
export function parseAppTheme(indexCss: string): AppTheme {
  const block = rootBlock(indexCss ?? '')
  if (!block) return { tokens: {} }
  const decls = parseDecls(block.body)
  const tokens: Record<string, string> = {}
  for (const [name, value] of Object.entries(decls)) {
    if (name === 'radius' || name.startsWith('font-')) continue
    tokens[name] = value
  }
  return {
    tokens,
    radius: decls['radius'],
    fontSans: decls['font-sans'] ? strip(decls['font-sans']) : undefined,
    fontDisplay: decls['font-display'] ? strip(decls['font-display']) : undefined,
    fontMono: decls['font-mono'] ? strip(decls['font-mono']) : undefined,
  }
}

function serializeRootBody(theme: AppTheme, preserved: Record<string, string>): string {
  const lines: string[] = []
  const written = new Set<string>()
  const push = (name: string, value: string | undefined) => {
    if (value === undefined || written.has(name)) return
    written.add(name)
    lines.push(`  --${name}: ${value};`)
  }
  for (const t of COLOR_TOKENS) push(t, theme.tokens[t] ?? preserved[t])
  // any extra tokens the app defined (charts, gradients…) survive the rewrite
  for (const [name, value] of Object.entries({ ...preserved, ...theme.tokens })) {
    if (name === 'radius' || name.startsWith('font-')) continue
    push(name, value)
  }
  push('radius', theme.radius ?? preserved['radius'])
  push('font-sans', theme.fontSans ? `'${theme.fontSans}'` : preserved['font-sans'])
  push('font-display', theme.fontDisplay ? `'${theme.fontDisplay}'` : preserved['font-display'])
  push('font-mono', theme.fontMono ? `'${theme.fontMono}'` : preserved['font-mono'])
  return lines.join('\n')
}

/**
 * Rewrite src/index.css's :root{} block with the given theme. Declarations the
 * theme doesn't cover are preserved; everything outside the block is untouched.
 * No :root block → one is prepended (after any @tailwind directives).
 */
export function writeAppTheme(indexCss: string, theme: AppTheme): string {
  const css = indexCss ?? ''
  const block = rootBlock(css)
  if (block) {
    const preserved = parseDecls(block.body)
    const nextBlock = `:root {\n${serializeRootBody(theme, preserved)}\n}`
    return css.slice(0, block.start) + nextBlock + css.slice(block.end)
  }
  const newBlock = `:root {\n${serializeRootBody(theme, {})}\n}`
  const lastDirective = css.lastIndexOf('@tailwind')
  if (lastDirective !== -1) {
    const lineEnd = css.indexOf('\n', lastDirective)
    const at = lineEnd === -1 ? css.length : lineEnd + 1
    return css.slice(0, at) + '\n' + newBlock + '\n' + css.slice(at)
  }
  return `${newBlock}\n${css}`
}

/** CSS for the preview's instant `wyber-apply-theme` override (no rebuild). */
export function themeToCss(theme: AppTheme): string {
  const lines: string[] = []
  for (const [name, value] of Object.entries(theme.tokens)) lines.push(`  --${name}: ${value};`)
  if (theme.radius) lines.push(`  --radius: ${theme.radius};`)
  if (theme.fontSans) lines.push(`  --font-sans: '${theme.fontSans}';`)
  if (theme.fontDisplay) lines.push(`  --font-display: '${theme.fontDisplay}';`)
  if (theme.fontMono) lines.push(`  --font-mono: '${theme.fontMono}';`)
  return `:root {\n${lines.join('\n')}\n}\nbody { font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; }`
}

/** A palette from Session B's catalog, as an applicable theme. */
export function paletteToTheme(pal: Palette): AppTheme {
  return {
    tokens: { ...pal.tokens },
    radius: pal.radius,
    fontSans: pal.fontSans,
    fontDisplay: pal.fontDisplay,
  }
}

// ── Neutral scaffolds (dark/light) for the custom builder ─────────────────
// Values mirror design-system.ts TOKEN_VARS_CSS so "start from dark/light"
// always matches the platform's safety-net defaults.

export const DARK_SCAFFOLD: Record<string, string> = {
  background: '240 10% 3.9%', foreground: '0 0% 98%',
  card: '240 10% 5.5%', 'card-foreground': '0 0% 98%',
  popover: '240 10% 5.5%', 'popover-foreground': '0 0% 98%',
  primary: '199 89% 48%', 'primary-foreground': '0 0% 100%',
  secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%',
  muted: '240 3.7% 15.9%', 'muted-foreground': '240 5% 64.9%',
  accent: '240 3.7% 15.9%', 'accent-foreground': '0 0% 98%',
  destructive: '0 62.8% 50.6%', 'destructive-foreground': '0 0% 98%',
  border: '240 3.7% 15.9%', input: '240 3.7% 15.9%', ring: '199 89% 48%',
}

export const LIGHT_SCAFFOLD: Record<string, string> = {
  background: '0 0% 100%', foreground: '240 10% 3.9%',
  card: '0 0% 100%', 'card-foreground': '240 10% 3.9%',
  popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%',
  primary: '199 89% 48%', 'primary-foreground': '0 0% 100%',
  secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%',
  muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%',
  accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%',
  destructive: '0 84.2% 60.2%', 'destructive-foreground': '0 0% 98%',
  border: '240 5.9% 90%', input: '240 5.9% 90%', ring: '240 5.9% 10%',
}

// ── HSL channel ↔ hex (for <input type="color"> pickers) ──────────────────

/** "199 89% 48%" → "#0ea5e9"-style hex. Invalid input → #000000. */
export function hslChannelsToHex(channels: string): string {
  const m = (channels ?? '').trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) return '#000000'
  const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) { r = g = b = l }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** "#0ea5e9" → "199 89% 48%"-style HSL channels. Invalid input → "0 0% 0%". */
export function hexToHslChannels(hex: string): string {
  const m = (hex ?? '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return '0 0% 0%'
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
