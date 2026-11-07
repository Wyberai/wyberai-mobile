// Ported from the web repo's src/lib/security-beast-scan.ts: types, the checklist
// (id/label/order) and the fix prompts only. The scan engine itself runs
// server-side (POST /api/security/beast-scan), so it is not bundled in the app.

export type CheckStatus = 'pass' | 'warn' | 'fail'
export type CheckSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface BeastCheck {
  id: string
  label: string
  status: CheckStatus
  severity: CheckSeverity
  detail: string
}

export interface BeastScanReport {
  score: number
  checks: BeastCheck[]
  scannedAt: string
  // Auto-generated fixes for the checks that are safe to fix mechanically
  // (no code judgment required) — path -> full new file content. Everything
  // else (secrets, auth gaps, SQLi, etc.) needs a real code change and is
  // deliberately left to "Fix with AI" instead of being rewritten blind.
  fixedFiles?: Record<string, string>
  fixedCheckIds?: string[]
}

// Single source of truth for the checklist's id/label/order — imported by
// both this engine (so every produced check matches a known id) and the UI
// (to render the full "here's what we'll check" list before the scan runs).
export const SECURITY_BEAST_CHECKLIST: { id: string; label: string }[] = [
  { id: 'secrets', label: 'No hardcoded API keys or secrets' },
  { id: 'env-file', label: 'No committed .env with real secrets' },
  { id: 'client-env-leak', label: 'Server secrets kept out of the client bundle' },
  { id: 'cors', label: "CORS isn't wide open to '*'" },
  { id: 'rate-limit', label: 'API routes have rate limiting' },
  { id: 'xss', label: 'Protected against XSS (dangerouslySetInnerHTML)' },
  { id: 'eval', label: 'No eval() / new Function() usage' },
  { id: 'sql-injection', label: 'No SQL built by string concatenation' },
  { id: 'admin-auth', label: 'Admin routes require authentication' },
  { id: 'security-headers', label: 'Security headers configured' },
  { id: 'secure-cookies', label: 'Cookies marked httpOnly & secure' },
  { id: 'token-storage', label: 'Auth tokens kept out of localStorage' },
  { id: 'plaintext-password', label: 'Passwords never stored in plaintext' },
  { id: 'webhook-signature', label: 'Webhooks verify their signature' },
  { id: 'debug-artifacts', label: 'No debug leftovers (stray logs, debugger statements)' },
  { id: 'file-upload', label: 'File uploads validate type & size' },
]

// Only for the checks the scan does NOT already fix mechanically (security-
// headers and debug-artifacts get a real code edit written automatically —
// see buildSecurityHeadersFix/stripDebugArtifacts below). Everything here
// needs code judgment specific to the flagged file(s), so "Fix with AI" (and
// "Apply all fixes") sends the model there instead of a blind template edit.
export const SECURITY_FIX_PROMPTS: Record<string, string> = {
  secrets: 'Remove the hardcoded API keys/secrets flagged by the security scan — move each one to an environment variable (never NEXT_PUBLIC_-prefixed) and update every place that used the hardcoded value to read from process.env instead.',
  'env-file': 'A committed .env file has real-looking secret values. Move those values out of the repo — replace them with placeholders in .env.example and make sure the real values are only ever set as actual environment variables, never committed.',
  'client-env-leak': 'A server-only environment variable is being read from client-side code. Move that logic into a server-only file or API route, and have the client call that route instead of reading the env var directly.',
  cors: "Replace the wide-open CORS policy (Access-Control-Allow-Origin: '*') with a specific allowed origin (or a small allowlist) appropriate for this app.",
  'rate-limit': 'Add rate limiting to this app\'s API routes so a single endpoint can\'t be hammered with unlimited requests.',
  xss: 'Every use of dangerouslySetInnerHTML is rendering unsanitized content. Add a sanitizer (e.g. DOMPurify) and sanitize the HTML before it\'s rendered.',
  eval: 'Remove the eval()/new Function() usage flagged by the security scan and replace it with a safe, non-dynamic equivalent.',
  'sql-injection': 'Rewrite the raw SQL built by string concatenation/template interpolation to use parameterized queries instead.',
  'admin-auth': 'Add an authentication check (matching the pattern already used elsewhere in this app) to the admin route(s) that currently have none.',
  'secure-cookies': 'Add the httpOnly and secure flags to the session/auth cookie(s) that are missing them.',
  'token-storage': 'Move the auth/session token currently stored in localStorage into an httpOnly cookie instead.',
  'plaintext-password': 'Add password hashing (bcrypt or argon2) before the password field is written, instead of storing it in plaintext.',
  'webhook-signature': "Add signature verification to the webhook route(s) that currently accept a payload with no check — verify against that provider's actual signing method before trusting the request.",
  'file-upload': 'Add file type and size validation to the file-upload route(s) that currently have none.',
}

