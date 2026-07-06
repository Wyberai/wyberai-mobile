// Ported from the web app (src/lib/file-parser.ts) — pure string logic, no deps.
// Parses the <file>/<edit> protocol streamed by /api/generate so the mobile
// builder can save results and show clean progress text, exactly like the web
// editor's ChatPanel does.

export interface ParsedFile {
  path: string;
  content: string;
}
export interface ParseResult {
  files: ParsedFile[];
  chatText: string;
}

const FILE_BLOCK_RE = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;

function stripThinking(raw: string): string {
  let out = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  out = out.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  const openIdx = out.search(/<thinking>|<reasoning>/i);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out;
}

export function parseGenerationOutput(raw: string): ParseResult {
  const files: ParsedFile[] = [];
  const working = stripThinking(raw);
  let chatText = working.replace(FILE_BLOCK_RE, (_m, path, content) => {
    files.push({ path: String(path).trim(), content: String(content).trim() });
    return '';
  });
  chatText = chatText.replace(/<edit\s+path="[^"]*">[\s\S]*?<\/edit>/g, '');
  const openEditIdx = chatText.search(/<edit\s+path="/i);
  if (openEditIdx !== -1) chatText = chatText.slice(0, openEditIdx);
  chatText = chatText.replace(/```edited:[^`]*```/g, '');
  chatText = chatText.replace(/```[\s\S]*?```/g, '');
  chatText = chatText.replace(/\[progress:[^\]]+\]/gi, '');
  chatText = chatText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .trim();
  return { files, chatText };
}

// Strip thinking + complete/partial file & edit blocks + protocol noise from a
// streaming buffer so the live view never shows raw machinery mid-stream.
export function cleanStreamingDisplay(raw: string): string {
  let out = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  const openThink = out.search(/<thinking>/i);
  if (openThink !== -1) out = out.slice(0, openThink);
  out = out.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  const openReasoning = out.search(/<reasoning>/i);
  if (openReasoning !== -1) out = out.slice(0, openReasoning);
  out = out.replace(/<file\s+path="[^"]*">[\s\S]*?<\/file>/g, '');
  out = out.replace(/<edit\s+path="[^"]*">[\s\S]*?<\/edit>/g, '');
  const openFile = out.search(/<file\s+path="/i);
  if (openFile !== -1) out = out.slice(0, openFile);
  const openEdit = out.search(/<edit\s+path="/i);
  if (openEdit !== -1) out = out.slice(0, openEdit);
  out = out.replace(/\/\*\s*SQL TO RUN IN SUPABASE[\s\S]*?\*\//gi, '');
  const openSql = out.search(/\/\*\s*SQL TO RUN IN SUPABASE/i);
  if (openSql !== -1) out = out.slice(0, openSql);
  out = out.replace(/<<<<<<<\s*SEARCH[\s\S]*?>>>>>>>\s*REPLACE/g, '');
  const openSearch = out.search(/<<<<<<<\s*SEARCH/);
  if (openSearch !== -1) out = out.slice(0, openSearch);
  return out.trim();
}

// Extract [progress: ...] step labels from a streaming buffer, in order, deduped.
export function extractProgressLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\[progress:\s*([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const label = m[1].trim();
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export interface EditBlockParsed {
  path: string;
  search: string;
  replace: string;
}

export function parseEditBlocks(raw: string): EditBlockParsed[] {
  const out: EditBlockParsed[] = [];
  const working = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  const editRe = /<edit\s+path="([^"]+)">([\s\S]*?)<\/edit>/g;
  let m: RegExpExecArray | null;
  while ((m = editRe.exec(working)) !== null) {
    const path = m[1].trim();
    const body = m[2];
    const pairRe = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n?=======\s*\n([\s\S]*?)\n?>>>>>>>\s*REPLACE/g;
    let p: RegExpExecArray | null;
    while ((p = pairRe.exec(body)) !== null) {
      out.push({ path, search: p[1], replace: p[2] });
    }
  }
  return out;
}

export function hasEditBlocks(raw: string): boolean {
  return /<edit\s+path="/.test(raw);
}

// Apply parsed <edit> search/replace blocks onto a file map. Mirrors the web
// patch-applier's core behaviour (literal first match). Returns changed paths.
export function applyEdits(
  files: Record<string, { content: string; language?: string }>,
  edits: EditBlockParsed[],
): string[] {
  const changed = new Set<string>();
  for (const e of edits) {
    const f = files[e.path];
    if (!f || !f.content.includes(e.search)) continue;
    f.content = f.content.replace(e.search, e.replace);
    changed.add(e.path);
  }
  return [...changed];
}
