// Verity's deterministic post-apply checks. No model call — pure structural
// verification of the applied file set. Failures feed the existing free
// self-heal lane (wyber-autofix), narrated as QA agent events.
// Pure module: no React, no network.

type FileVal = { content?: string } | string

const content = (v: FileVal | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.content ?? '')

const CODE_FILE = /\.(tsx?|jsx?)$/i
const IMPORT_RE = /(?:from\s+|import\s+)['"]([^'"]+)['"]/g
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
// Files the platform injects into every build — always resolvable even though
// they aren't in the project file map (see sanitize-files.ts / engine.ts).
const INJECTED = new Set(['src/wyber-ui', 'src/wyber-store', './wyber-ui', './wyber-store'])

function resolveLocal(spec: string, fromPath: string, paths: Set<string>): boolean {
  let base: string
  if (spec.startsWith('.')) {
    const dir = fromPath.split('/').slice(0, -1)
    for (const p of spec.split('/')) {
      if (p === '.' || p === '') continue
      else if (p === '..') dir.pop()
      else dir.push(p)
    }
    base = dir.join('/')
  } else if (spec.startsWith('@/')) {
    base = 'src/' + spec.slice(2)
  } else if (spec.startsWith('src/')) {
    base = spec
  } else {
    return true // bare module specifier (npm package) — not ours to verify
  }
  if (INJECTED.has(spec) || INJECTED.has(base) || base.endsWith('/wyber-ui') || base.endsWith('/wyber-store')) return true
  return RESOLVE_EXTS.some(e => paths.has(base + e))
}

export interface QaIssue {
  kind: 'broken-import' | 'missing-entry'
  detail: string
  /** Prompt for the free self-heal lane to fix this issue. */
  fixPrompt: string
}

/**
 * Check the applied file set for structural problems the preview can't always
 * surface as a runtime error (sanitize-files stubs missing imports so the app
 * "renders" with silently-dead features).
 */
export function runQaChecks(files: Record<string, FileVal>, projectType?: string): QaIssue[] {
  const issues: QaIssue[] = []
  const paths = new Set(Object.keys(files || {}))

  // Broken local imports: file A imports ./B but B was never written.
  const broken = new Map<string, string[]>() // missing spec -> importing files
  for (const [path, val] of Object.entries(files || {})) {
    if (!CODE_FILE.test(path)) continue
    const code = content(val)
    if (!code) continue
    IMPORT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(code)) !== null) {
      if (!resolveLocal(m[1], path, paths)) {
        const list = broken.get(m[1]) ?? []
        list.push(path)
        broken.set(m[1], list)
      }
    }
  }
  for (const [spec, importers] of broken) {
    issues.push({
      kind: 'broken-import',
      detail: `${spec} is imported by ${importers[0]}${importers.length > 1 ? ` (+${importers.length - 1} more)` : ''} but was never written`,
      fixPrompt: `The file imported as "${spec}" (referenced from ${importers.join(', ')}) does not exist in the project. Output the COMPLETE <file> block implementing it, matching how the importer uses it. Do not rewrite the importing files.`,
    })
  }

  // Entry file present (the placeholder-App case is handled separately by
  // isPlaceholderApp in ChatPanel — this only covers total absence).
  const entry = projectType === 'mobile' ? 'App.tsx' : 'src/App.tsx'
  if (paths.size > 0 && !paths.has(entry) && !paths.has('src/App.jsx')) {
    issues.push({
      kind: 'missing-entry',
      detail: `${entry} is missing — the app has no entry file`,
      fixPrompt: `${entry} is missing, so the app cannot render. Output the COMPLETE <file> block for ${entry}, wiring together the components that already exist.`,
    })
  }

  return issues
}
