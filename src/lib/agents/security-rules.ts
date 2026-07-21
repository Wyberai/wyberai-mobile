// Sentinel's in-stream review rules. Deterministic — no model call — so they
// run in <5ms per emitted file, inside the generation loop, for free.
// Blocking findings trigger a corrective iteration (the coder is handed the
// veto as a tool_result and must re-emit); advisory findings are recorded and
// rendered but never stop the build. The publish gate remains the hard wall.
// Pure module: no React, no network.

import { scanFileForSecrets } from '../security-scan'
import type { FindingSeverity } from './events'

export interface SecurityRuleFinding {
  /** Stable id within a turn, e.g. "sec-1". Caller assigns via makeFindingId. */
  findingId: string
  ruleId:
    | 'secret-literal'
    | 'service-role-client'
    | 'sql-missing-rls'
    | 'unauthed-mutation'
    | 'unsafe-html'
  severity: FindingSeverity
  /** Human-readable, feed-facing line. */
  detail: string
  /** Instruction handed back to the coder for a corrective iteration. */
  fixInstruction: string
  blocking: boolean
  file: string
}

// Generated apps are pure client bundles — every emitted src/ file ships to
// the browser, so "client code" here means any code file at all.
const CODE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/i

const SERVICE_ROLE_REF = /\b(service_role|SERVICE_ROLE|SUPABASE_SERVICE_ROLE(?:_KEY)?|serviceRoleKey)\b/

const MUTATION_CALL = /\.(insert|update|delete|upsert)\s*\(/
const AUTH_REF = /\b(auth\.getUser|auth\.getSession|getSession|useUser|useAuth|useSession|user\.id|session\b|onAuthStateChange|requireAuth)\b/

const DANGEROUS_HTML = /dangerouslySetInnerHTML\s*=\s*\{\{?\s*__html\s*:\s*(?!\s*["'`])/
const EVAL_CALL = /(?<![\w.$])eval\s*\(/

let findingCounter = 0
/** Module-level fallback id source (fine for tests; the route passes its own). */
export function makeFindingId(): string {
  findingCounter += 1
  return `sec-${findingCounter}`
}
export function resetFindingIds(): void {
  findingCounter = 0
}
/** Per-request id generator — concurrent requests in one serverless instance
 * share module state, so the route uses this instead of the module counter. */
export function createFindingIdGenerator(): () => string {
  let n = 0
  return () => `sec-${++n}`
}

export interface ReviewOptions {
  /** Patch mode (edit_file replace text): only the always-blocking rules 1–2
   * run — the other rules need whole-file context and would false-positive
   * on a fragment. */
  patch?: boolean
  nextId?: () => string
}

/**
 * Review one emitted file. `emittedSql` is the accumulated SQL from this turn
 * (schema comment blocks and .sql files) so the RLS rule can see policies that
 * were emitted in a different block than the create table.
 */
export function reviewEmittedFile(
  path: string,
  content: string,
  emittedSql: string,
  opts: ReviewOptions = {},
): SecurityRuleFinding[] {
  if (!content) return []
  const nextId = opts.nextId ?? makeFindingId
  const findings: SecurityRuleFinding[] = []
  const isCode = CODE_FILE.test(path)
  const isSql = /\.sql$/i.test(path)

  // Rule 1 — secret literals (critical, blocking)
  for (const name of scanFileForSecrets(content)) {
    findings.push({
      findingId: nextId(),
      ruleId: 'secret-literal',
      severity: 'critical',
      blocking: true,
      file: path,
      detail: `${name} hardcoded in ${path}`,
      fixInstruction: `SECURITY VETO: ${path} contains a hardcoded ${name}. Re-emit the file without the secret — reference it as a placeholder the user provides at runtime (never embed live credentials in app code).`,
    })
  }

  // Rule 2 — service-role key referenced in client code (critical, blocking)
  if (isCode && SERVICE_ROLE_REF.test(content)) {
    findings.push({
      findingId: nextId(),
      ruleId: 'service-role-client',
      severity: 'critical',
      blocking: true,
      file: path,
      detail: `service-role key referenced in client code (${path})`,
      fixInstruction: `SECURITY VETO: ${path} references the Supabase service-role key. The service-role key bypasses RLS and must never appear in client code. Re-emit the file using the anon key with RLS policies instead.`,
    })
  }

  // Rules 3–5 need whole-file context — skipped in patch mode (see ReviewOptions).
  if (opts.patch) return findings

  // Rule 3 — SQL creates a table without RLS + at least one policy (critical, blocking)
  if (isSql || /create\s+table/i.test(content)) {
    const sqlScope = `${emittedSql}\n${content}`
    for (const table of findTablesWithoutRls(sqlScope)) {
      findings.push({
        findingId: nextId(),
        ruleId: 'sql-missing-rls',
        severity: 'critical',
        blocking: true,
        file: path,
        detail: `table "${table}" created without row-level security`,
        fixInstruction: `SECURITY VETO: the SQL creates table "${table}" without enabling row-level security. Re-emit the SQL with \`alter table ${table} enable row level security;\` and at least one \`create policy\` statement scoping access (e.g. to auth.uid()).`,
      })
    }
  }

  // Rule 4 — mutations with no auth reference anywhere in the file (high, advisory)
  if (isCode && MUTATION_CALL.test(content) && !AUTH_REF.test(content)) {
    findings.push({
      findingId: nextId(),
      ruleId: 'unauthed-mutation',
      severity: 'high',
      blocking: false,
      file: path,
      detail: `database writes in ${path} with no auth check in scope`,
      fixInstruction: `${path} performs inserts/updates/deletes without referencing the signed-in user. Ensure RLS policies gate these writes, or check the session before mutating.`,
    })
  }

  // Rule 5 — dangerouslySetInnerHTML with non-literal input / eval (medium, advisory)
  if (isCode && (DANGEROUS_HTML.test(content) || EVAL_CALL.test(content))) {
    findings.push({
      findingId: nextId(),
      ruleId: 'unsafe-html',
      severity: 'medium',
      blocking: false,
      file: path,
      detail: `unsafe dynamic HTML/eval in ${path}`,
      fixInstruction: `${path} injects non-literal HTML (or calls eval). Sanitize the input or render it as text to avoid XSS.`,
    })
  }

  return findings
}

/**
 * Tables created in `sql` that have neither `enable row level security` nor
 * any `create policy` referencing them. Case-insensitive, tolerant of
 * `if not exists`, schema prefixes, and quoted identifiers.
 */
export function findTablesWithoutRls(sql: string): string[] {
  if (!sql || !/create\s+table/i.test(sql)) return []
  const norm = sql.toLowerCase()
  const created: string[] = []
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w]+\.)?"?([a-z_][\w]*)"?/g
  let m: RegExpExecArray | null
  while ((m = createRe.exec(norm)) !== null) created.push(m[1])
  if (!created.length) return []

  const missing: string[] = []
  for (const table of created) {
    const rlsRe = new RegExp(
      `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:[\\w]+\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`,
    )
    const policyRe = new RegExp(`create\\s+policy\\s+[^;]*?\\bon\\s+(?:[\\w]+\\.)?"?${table}"?\\b`)
    if (!rlsRe.test(norm) || !policyRe.test(norm)) missing.push(table)
  }
  return missing
}
