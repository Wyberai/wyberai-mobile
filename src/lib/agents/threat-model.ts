// Sentinel's threat model: a static map of the app's attack surface, derived
// deterministically from the project files. Complements the live RLS scan —
// the scan PROBES the database from outside; this maps what the code touches
// (data stores, auth surfaces, external calls, risky sinks, secrets). Because
// it recomputes from files, it is always current and needs no storage.
// Pure module: no React, no network (same convention as qa-checks.ts).

import { scanForExposedSecrets } from '@/lib/security-scan'

type FileVal = { content?: string } | string

const content = (v: FileVal | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.content ?? '')

const CODE_FILE = /\.(tsx?|jsx?)$/i

export interface ExternalCall {
  domain: string
  files: string[]
}

export interface SensitiveSink {
  kind: 'dangerouslySetInnerHTML' | 'eval' | 'new Function' | 'document.write' | 'innerHTML assignment'
  file: string
}

export interface ThreatModel {
  /** Supabase tables the code reads or writes (`.from('x')`). */
  supabaseTables: string[]
  /** wyber-store collections — the data layer most generated apps actually use. */
  collections: string[]
  /** localStorage keys the app persists client-side. */
  localStorageKeys: string[]
  /** Human-readable auth mechanisms found (empty = no auth surface). */
  authSurfaces: string[]
  /** External domains the app calls out to, with the files that call them. */
  externalCalls: ExternalCall[]
  /** XSS-adjacent sinks worth a look. */
  sensitiveSinks: SensitiveSink[]
  /** Sensitive input fields collected from users (password, email, phone, card). */
  piiInputs: string[]
  /** Hard secrets embedded in client code (from security-scan.ts). */
  secretFindings: { file: string; name: string }[]
  filesAnalyzed: number
}

const AUTH_LABELS: [RegExp, string][] = [
  [/signInWithPassword|signUpWithPassword/, 'Email/password sign-in (Supabase Auth)'],
  [/signInWithOAuth/, 'OAuth sign-in (Supabase Auth)'],
  [/signInWithOtp/, 'Magic-link / OTP sign-in (Supabase Auth)'],
  [/\bauth\.signUp\b|supabase\.auth\.signUp/, 'Account signup (Supabase Auth)'],
  [/onAuthStateChange/, 'Session tracking (auth state listener)'],
]

const PII_LABELS: [RegExp, string][] = [
  [/type=["']password["']/, 'Passwords'],
  [/type=["']email["']|autocomplete=["']email["']/, 'Email addresses'],
  [/type=["']tel["']|autocomplete=["']tel["']/, 'Phone numbers'],
  [/autocomplete=["']cc-number["']|name=["'](card|cardNumber|cc)["']/i, 'Payment card fields'],
]

const SINKS: [RegExp, SensitiveSink['kind']][] = [
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/document\.write\s*\(/, 'document.write'],
  [/\.innerHTML\s*=/, 'innerHTML assignment'],
]

// fetch('https://…') / axios.get('https://…') / new WebSocket('wss://…')
const URL_RE = /["'`](https?|wss?):\/\/([^/"'`\s]+)[^"'`]*["'`]/g

// Domains that are platform plumbing, not the app's own attack surface.
const IGNORED_DOMAIN_RE = /(^|\.)(supabase\.co|supabase\.in|localhost|127\.0\.0\.1|fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|placehold\.co|picsum\.photos|w3\.org)$/i

export function buildThreatModel(files: Record<string, FileVal>): ThreatModel {
  const tables = new Set<string>()
  const collections = new Set<string>()
  const storageKeys = new Set<string>()
  const auth = new Set<string>()
  const pii = new Set<string>()
  const sinks: SensitiveSink[] = []
  const domains = new Map<string, Set<string>>()
  let filesAnalyzed = 0

  for (const [path, val] of Object.entries(files || {})) {
    if (!CODE_FILE.test(path)) continue
    const code = content(val)
    if (!code) continue
    filesAnalyzed++

    for (const m of code.matchAll(/\.from\(\s*["'`]([\w.]+)["'`]\s*\)/g)) tables.add(m[1])
    // wyber-store collections: useCollection('tasks') / getCollection("users")
    for (const m of code.matchAll(/(?:useCollection|getCollection)(?:<[^>]*>)?\(\s*["'`]([\w-]+)["'`]/g)) collections.add(m[1])
    for (const m of code.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*["'`]([^"'`]+)["'`]/g)) storageKeys.add(m[1])
    for (const [re, label] of AUTH_LABELS) if (re.test(code)) auth.add(label)
    for (const [re, label] of PII_LABELS) if (re.test(code)) pii.add(label)
    for (const [re, kind] of SINKS) if (re.test(code)) sinks.push({ kind, file: path })
    for (const m of code.matchAll(URL_RE)) {
      const domain = m[2].split(':')[0].toLowerCase()
      if (IGNORED_DOMAIN_RE.test(domain)) continue
      const set = domains.get(domain) ?? new Set<string>()
      set.add(path)
      domains.set(domain, set)
    }
  }

  const secretScan = scanForExposedSecrets(files as Record<string, { content?: string }>)

  return {
    supabaseTables: [...tables].sort(),
    collections: [...collections].sort(),
    localStorageKeys: [...storageKeys].sort(),
    authSurfaces: [...auth],
    externalCalls: [...domains.entries()]
      .map(([domain, f]) => ({ domain, files: [...f].sort() }))
      .sort((a, b) => a.domain.localeCompare(b.domain)),
    sensitiveSinks: sinks,
    piiInputs: [...pii],
    secretFindings: secretScan.findings,
    filesAnalyzed,
  }
}

/** True when the model has anything worth showing at all. */
export function threatModelHasContent(tm: ThreatModel): boolean {
  return tm.supabaseTables.length > 0 || tm.collections.length > 0 || tm.localStorageKeys.length > 0
    || tm.authSurfaces.length > 0 || tm.externalCalls.length > 0
    || tm.sensitiveSinks.length > 0 || tm.piiInputs.length > 0
    || tm.secretFindings.length > 0
}
