// staged-plan.ts
// Pure logic for Wyber staged generation: parse the plan manifest, decide
// whether to stage, and group files into safe-sized batches.
//
// Ported verbatim from the web app (src/lib/staged-plan.ts) — pure module,
// no React, no network, so it's safe to share byte-for-byte. Keep this file
// in sync with the web original; it's the single source of truth for how a
// build gets staged, and drift here would make mobile and web charge/behave
// differently for the identical prompt.

export interface PlannedFile {
  path: string
  purpose: string
}

export interface StagedPlan {
  files: PlannedFile[]
  shouldStage: boolean
  scaffoldPaths: string[]   // files built in the scaffold pass (shell/theme/layout)
  fillBatches: PlannedFile[][] // remaining files, grouped into batches of 2-3
}

// Apps with fewer than this many files generate in one shot (no staging).
// Set very high to force one-shot for all builds, same as web (502b513) while
// the staged pipeline is unstable.
export const STAGE_THRESHOLD = 999
// Files per fill batch. Each fill pass gets a 24,000-token budget on Opus
// (see generate/route.ts's stageMaxTokens) — comfortable headroom for 2
// typical component files, which is why this was set conservatively low.
// Raised 2→3: a typical 6-9 file build was paying 3 full sequential API
// round-trips for the fill stage alone (network + generation latency each,
// observed 15-90s per pass depending on load) when 2 would often do,
// meaningfully cutting build wall-clock time for the common case. Any batch
// that genuinely needs more than the budget still hits the EXISTING
// max_tokens continuation safety net (see A3 in docs/failure-modes.md) rather
// than losing content — this doesn't remove that protection, it just asks
// for it less often.
export const FILL_BATCH_SIZE = 3

// Paths that belong in the scaffold pass: the shell that makes the preview
// render a skeleton immediately. Matched case-insensitively on the basename.
const SCAFFOLD_HINTS = [
  'index.css', 'app.tsx', 'app.jsx', 'main.tsx', 'main.jsx',
  'sidebar', 'layout', 'nav', 'navbar', 'shell', 'router', 'routes', 'theme',
]

function isScaffoldFile(path: string): boolean {
  const lower = path.toLowerCase()
  const basename = lower.split('/').pop() ?? lower
  const segments = lower.split('/')
  return SCAFFOLD_HINTS.some((h) =>
    // basename fully matches or starts with hint: app.tsx, nav.tsx, theme.ts
    basename === h || basename.startsWith(h + '.') ||
    // basename contains hint as a substring: AppNavigator (has 'nav'),
    // ThemeContext (has 'theme'), BottomTabRouter (has 'router')
    // — checked on the filename only, NOT on directory names, so
    // src/navigation/HomeScreen.tsx doesn't match 'nav' (basename='homescreen.tsx')
    basename.includes(h) ||
    // hint is an exact path SEGMENT: src/nav/x.ts → segments=['src','nav','x.ts']
    // 'nav' matches; 'navigation' does NOT match 'nav' (exact comparison)
    segments.includes(h)
  )
}

/**
 * Parse the model's plan response into a manifest. The plan call is instructed
 * to return a JSON array of {path, purpose}. We tolerate code fences and stray
 * prose around the JSON.
 */
export function parsePlanManifest(raw: string): PlannedFile[] {
  if (!raw) return []
  // Strip markdown fences
  let text = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  // Find the JSON array — anchor on [{" to skip any prose lists before the manifest
  const anchor = text.indexOf('[{')
  const start = anchor !== -1 ? anchor : text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  text = text.slice(start, end + 1)
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((f) => f && typeof f.path === 'string' && f.path.trim().length > 0)
      .map((f) => ({
        path: f.path.trim(),
        purpose: typeof f.purpose === 'string' ? f.purpose.trim() : '',
      }))
  } catch {
    return []
  }
}

/**
 * Given a parsed manifest, build the staging plan: decide whether to stage,
 * split scaffold vs fill, and batch the fill files.
 */
export function buildStagedPlan(files: PlannedFile[]): StagedPlan {
  const shouldStage = files.length >= STAGE_THRESHOLD

  if (!shouldStage) {
    return { files, shouldStage: false, scaffoldPaths: [], fillBatches: [] }
  }

  const scaffold = files.filter((f) => isScaffoldFile(f.path))
  const fill = files.filter((f) => !isScaffoldFile(f.path))

  // Safety: if nothing matched scaffold hints, find the best candidate for a
  // shell file (App.tsx / index.* / main.*) rather than blindly taking fill[0]
  // which may be a data model or feature screen.
  if (scaffold.length === 0 && fill.length > 0) {
    const shellIdx = fill.findIndex(f => {
      const base = f.path.split('/').pop()?.toLowerCase() ?? ''
      return base.startsWith('app.') || base.startsWith('index.') || base.startsWith('main.')
    })
    const picked = shellIdx >= 0 ? fill.splice(shellIdx, 1)[0] : fill.shift()
    scaffold.push(picked as PlannedFile)
  }

  // Group fill files into small batches
  const fillBatches: PlannedFile[][] = []
  for (let i = 0; i < fill.length; i += FILL_BATCH_SIZE) {
    fillBatches.push(fill.slice(i, i + FILL_BATCH_SIZE))
  }

  return {
    files,
    shouldStage: true,
    scaffoldPaths: scaffold.map((f) => f.path),
    fillBatches,
  }
}

/**
 * The scaffold pass is explicitly told to render a "Coming up next..."
 * placeholder for every screen not in its own file list (see the SCAFFOLD
 * PASS prompt in api/generate/route.ts) — and fill passes are explicitly
 * forbidden from touching App.tsx/scaffold files, so nothing ever goes back
 * to replace those placeholders once the real screens exist. This finds the
 * scaffold file that actually renders route/section content (App.tsx-like),
 * as opposed to theme/sidebar/index.css files that never reference a
 * placeholder — the one the final "wire the real screens in" pass needs to
 * target. Same basename heuristic buildStagedPlan already uses for its
 * shell-file fallback.
 */
export function pickRouterFile(scaffoldPaths: string[]): string | undefined {
  const byBasename = (prefix: string) => scaffoldPaths.find((p) => {
    const base = p.split('/').pop()?.toLowerCase() ?? ''
    return base.startsWith(prefix)
  })
  return byBasename('app.') ?? byBasename('main.')
}

/**
 * Turn a batch's files into a short, human "Forge log" line for the chat UI.
 * Uses the feature purpose, not the filename, so it reads like a craftsman
 * narrating rather than a compiler logging.
 */
// Atlas (the plan step) sometimes lists a platform-provided file (e.g.
// wyber-store.ts) with a purpose that's a note to itself, not a feature
// description — "DO NOT CREATE - platform injected local-first storage" is a
// real one seen live. forgeLine used to surface that verbatim as "Building
// the DO NOT CREATE - platform injected local-first storage", leaking
// planning metadata into the user-facing progress line. Filter those out.
function looksLikeInternalNote(purpose: string): boolean {
  return /^do not\b/i.test(purpose)
    || /platform.injected/i.test(purpose)
    || /already (exists|provided)/i.test(purpose)
    || /^skip\b/i.test(purpose)
    || /injected by/i.test(purpose)
    || /handled by (platform|framework|wyber)/i.test(purpose)
    || /framework provides/i.test(purpose)
}

// Manifests of 0-1 files aren't worth diffing — a single-file edit request is
// either fully addressed or the model just did something different, and
// retrying on that thin a signal produces more false positives than value.
export const EDIT_COMPLETENESS_MIN_FILES = 2

/**
 * Given an edit-plan manifest and the paths actually written/edited this
 * pass, return the planned files that were never addressed. Exact-path
 * comparison (trimmed) — same precision level parsePlanManifest already
 * normalizes paths to, and the same Set-membership approach qa-checks.ts
 * uses for its own path checks. Deliberately no fuzzy/near-miss matching:
 * a false "still missing" is a wasted free retry pass; a false "handled"
 * from over-eager matching would silently defeat the whole check.
 */
export function diffPlannedAgainstWritten(planned: PlannedFile[], writtenPaths: string[]): PlannedFile[] {
  const written = new Set(writtenPaths.map((p) => p.trim()))
  return planned.filter((f) => !written.has(f.path.trim()))
}

// Atlas writes purposes as internal file-manifest documentation ("Reusable
// card component displaying a numeric metric, label, and colored icon (used
// for status/priority counts on Dashboard)") — accurate for planning, but it
// reads as leaked internal notes when echoed verbatim as a chat status line.
// Only a short, single-clause purpose passes as a natural "Building the X"
// sentence; anything longer or with a parenthetical aside falls back to the
// plain filename instead of being truncated (a chopped-off purpose reads even
// worse than the friendly-name fallback).
const FORGE_PURPOSE_MAX_LEN = 60

export function forgeLine(batch: PlannedFile[], phase: 'scaffold' | 'fill'): string {
  if (phase === 'scaffold') return 'Laying the foundation — shell, theme, and navigation'
  // Prefer the most descriptive purpose in the batch, skipping any that read
  // like an internal note or planning-doc prose rather than a short feature
  // description a user would recognize.
  const withPurpose = batch.find((f) =>
    f.purpose && f.purpose.length > 4 && f.purpose.length <= FORGE_PURPOSE_MAX_LEN
    && !f.purpose.includes('(') && !looksLikeInternalNote(f.purpose)
  )
  if (withPurpose) {
    // Clean the purpose into a short phrase
    const p = withPurpose.purpose.replace(/^(the|a|an)\s+/i, '').replace(/\.$/, '')
    return `Building the ${p}`
  }
  // Fallback to a friendly name derived from the file
  const name = batch[0].path.split('/').pop()?.replace(/\.(tsx|jsx|ts|js)$/, '') || 'feature'
  return `Building ${name}`
}

/**
 * Caps a plan to `max` files for the "simpler version" first build. Entry
 * files (App.*, index.*, main.*) always survive — some layouts list them last
 * and a plan without its entry file builds nothing. Original order is kept.
 */
export function capPlannedFiles(files: PlannedFile[], max: number): PlannedFile[] {
  if (files.length <= max) return files
  const isEntry = (p: string) => {
    const base = p.toLowerCase().split('/').pop() ?? ''
    return base.startsWith('app.') || base.startsWith('index.') || base.startsWith('main.')
  }
  const keep = new Set(files.filter((f) => isEntry(f.path)).slice(0, max))
  for (const f of files) {
    if (keep.size >= max) break
    keep.add(f)
  }
  return files.filter((f) => keep.has(f))
}
