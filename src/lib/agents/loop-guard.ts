// Anti-runaway loop detection for self-heal (Verity's judgment call).
// The blunt MAX_AUTOFIX cap stops volume; this stops FUTILITY: the same error
// signature seen twice means the fix strategy isn't working — stop burning
// passes and surface what was tried instead. Pure module: no React, no network.

/**
 * Normalize an error message into a stable signature: first meaningful line,
 * with paths, line/column numbers, hex addresses and ids stripped, lowercased.
 * Two occurrences of "the same" error produce the same signature even when
 * positions shift between passes.
 */
export function errorSignature(error: string): string {
  if (!error) return ''
  const firstLine = error.split('\n').find(l => l.trim().length > 0) || ''
  return firstLine
    .toLowerCase()
    .replace(/([a-z]:)?[\w./\\-]+\.(tsx?|jsx?|css|html|json)/g, '<file>') // file paths
    .replace(/:\d+(:\d+)?/g, '')                                          // :line:col
    .replace(/\b\d+\b/g, '<n>')                                           // bare numbers
    .replace(/0x[0-9a-f]+/g, '<hex>')
    .replace(/['"`][^'"`]{20,}['"`]/g, '<str>')                           // long string literals
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

/** Per-turn futility tracker. */
export class LoopGuard {
  private counts = new Map<string, number>()

  /** Record an error occurrence; returns how many times this signature has been seen. */
  record(error: string): number {
    const sig = errorSignature(error)
    if (!sig) return 0
    const n = (this.counts.get(sig) ?? 0) + 1
    this.counts.set(sig, n)
    return n
  }

  /** True when this error has already been attempted (i.e. this is a repeat). */
  isRepeat(error: string): boolean {
    const sig = errorSignature(error)
    return !!sig && (this.counts.get(sig) ?? 0) >= 1
  }

  reset(): void {
    this.counts.clear()
  }
}
