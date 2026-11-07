// Ported verbatim from the web repo's src/lib/launch-checklist.ts (pure logic).
// The human-judgment half of launch readiness. Research into how real launch-
// readiness/GTM frameworks are structured (YC's startup library, a 10-step
// startup launch checklist, Product Marketing Alliance's sales-readiness
// framework, Userpilot's product-launch playbook) turned up categories no
// scanner can check from source: pricing strategy, positioning, support
// staffing, marketing/launch channel, success metrics, legal entity status.
// Those are decisions and processes a founder makes, not code properties —
// launch-readiness.ts's automated scan deliberately does NOT claim to cover
// them. This is self-certified instead of scanned. A bare checkbox is
// gameable (tick it and move on), so items that benefit from it also ask for
// the real answer in a short note — forcing actual articulation is most of
// the signal.

export interface ChecklistItemDef {
  id: string
  label: string
  helper: string
  notePrompt?: string // when present, the UI shows a free-text field alongside the checkbox
}

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'positioning',
    label: 'You can say who this is for and why they’d pick it over alternatives',
    helper: 'Not a feature list — a one-sentence reason a specific person chooses you.',
    notePrompt: 'Write the one-liner',
  },
  {
    id: 'pricing',
    label: 'Pricing is decided and live',
    helper: 'Pricing is a go-to-market decision, not something to figure out after people show up.',
  },
  {
    id: 'support',
    label: 'A real person monitors the support/contact inbox',
    helper: 'Someone will actually see and answer the first messages, not just receive them.',
  },
  {
    id: 'marketing_channel',
    label: 'You know which channel you’re launching through',
    helper: 'Product Hunt, cold outreach, a community, ads — pick one you can actually execute.',
    notePrompt: 'Which channel?',
  },
  {
    id: 'success_metric',
    label: 'You’ve defined what "this worked" means, before launching',
    helper: 'A number and a deadline, decided now — not judged retroactively after the fact.',
    notePrompt: 'What’s the metric?',
  },
  {
    id: 'legal_entity',
    label: 'Your business is legally registered, if you’re accepting payments',
    helper: 'Needed for a real bank account, tax compliance, and most payment processors’ terms.',
  },
]

export interface ChecklistItemState {
  checked: boolean
  note?: string
}

export type ChecklistState = Record<string, ChecklistItemState>

export interface ChecklistProgress {
  done: number
  total: number
  complete: boolean
}

export function checklistProgress(state: ChecklistState): ChecklistProgress {
  const total = CHECKLIST_ITEMS.length
  const done = CHECKLIST_ITEMS.filter((i) => state[i.id]?.checked).length
  return { done, total, complete: done === total }
}

/** Strips unknown keys and coerces shape — defensive against a stale client sending an old item set. */
export function sanitizeChecklistState(raw: unknown): ChecklistState {
  const out: ChecklistState = {}
  if (!raw || typeof raw !== 'object') return out
  for (const item of CHECKLIST_ITEMS) {
    const v = (raw as Record<string, unknown>)[item.id]
    if (v && typeof v === 'object') {
      const checked = !!(v as { checked?: unknown }).checked
      const noteRaw = (v as { note?: unknown }).note
      out[item.id] = { checked, ...(typeof noteRaw === 'string' && noteRaw.trim() ? { note: noteRaw.trim().slice(0, 280) } : {}) }
    }
  }
  return out
}
