// Ported verbatim from the web app (src/lib/wyber-preview/bridge.ts) — just
// the injectWyberLoc half. The bridge SCRIPT half is NOT ported here: it's
// written for a browser iframe (window.parent.postMessage, hover via
// mousemove) and RN WebView's transport/interaction model is different
// enough (no window.parent, ReactNativeWebView.postMessage, tap not hover)
// that it needs its own implementation — see wyber-preview-mobile-bridge.ts.
// This half — tagging JSX DOM elements with a source location — is pure text
// transformation with no platform dependency, so it's shared byte-for-byte.

type FileVal = { content?: string; language?: string } | string

const fileContent = (v: FileVal | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.content ?? '')

const withContent = (v: FileVal, content: string): FileVal =>
  typeof v === 'string' ? content : { ...v, content }

// Lowercase DOM elements only — attributes on capitalized components become
// props and never reach the DOM. Conservative whitelist keeps false positives
// (comparisons like `a < b`) from corrupting expressions.
const HTML_TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'img',
  'section', 'header', 'footer', 'nav', 'main', 'aside', 'article',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'form', 'label', 'input', 'textarea', 'select', 'option',
  'strong', 'em', 'small', 'blockquote', 'pre', 'code', 'figure', 'figcaption',
  'video', 'audio', 'canvas', 'svg', 'footer', 'summary', 'details',
])

// Characters that legitimately precede a JSX opening tag. Anything else
// (identifier char, digit, quote) means "probably a comparison/generic" → skip.
const JSX_PREFIX = new Set(['(', '{', '>', ',', '?', ':', '&', '|', ';', '[', '='])

// True when `idx` sits inside an (unclosed) string literal on this line —
// counts unescaped quote chars before it. Crude but errs toward skipping.
function insideString(line: string, idx: number): boolean {
  let sq = 0, dq = 0, bt = 0
  for (let i = 0; i < idx; i++) {
    const c = line[i]
    if (c === '\\') { i++; continue }
    if (c === "'" && !dq && !bt) sq ^= 1
    else if (c === '"' && !sq && !bt) dq ^= 1
    else if (c === '`' && !sq && !dq) bt ^= 1
  }
  return !!(sq || dq || bt)
}

/**
 * Tag JSX DOM-element opening tags with data-wyber-loc="path:line".
 * Line numbers refer to the ORIGINAL file (injection never adds lines), so
 * they map 1:1 onto the user's saved source. Per-file try/catch: any hiccup
 * returns that file's original content untouched.
 */
export function injectWyberLoc<T extends Record<string, FileVal>>(files: T): T {
  const out: Record<string, FileVal> = {}
  for (const [path, val] of Object.entries(files)) {
    if (!/\.(tsx|jsx)$/.test(path)) { out[path] = val; continue }
    try {
      const src = fileContent(val)
      const lines = src.split('\n')
      let inBlockComment = false
      const tagged = lines.map((line, i) => {
        if (inBlockComment) {
          if (line.includes('*/')) inBlockComment = false
          return line
        }
        if (line.includes('/*') && !line.includes('*/')) inBlockComment = true

        const commentAt = line.indexOf('//')
        let result = ''
        const re = /<([a-z][a-zA-Z0-9]*)(?=[\s/>])/g
        let m: RegExpExecArray | null
        let lastEnd = 0
        re.lastIndex = 0
        while ((m = re.exec(line)) !== null) {
          const at = m.index
          const tag = m[1]
          if (!HTML_TAGS.has(tag)) continue
          if (commentAt !== -1 && at > commentAt) continue
          if (insideString(line, at)) continue
          let p = at - 1
          while (p >= 0 && (line[p] === ' ' || line[p] === '\t')) p--
          if (p >= 0 && !JSX_PREFIX.has(line[p])) continue
          if (line.slice(at, at + 200).includes('data-wyber-loc')) continue
          result += line.slice(lastEnd, at + 1 + tag.length) + ` data-wyber-loc="${path}:${i + 1}"`
          lastEnd = at + 1 + tag.length
        }
        if (!result) return line
        return result + line.slice(lastEnd)
      })
      out[path] = withContent(val, tagged.join('\n'))
    } catch {
      out[path] = val
    }
  }
  return out as T
}
