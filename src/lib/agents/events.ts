// Agent-team streaming events. Server-authored `[agent:{json}]` markers ride
// the same plain-text generation stream as `[progress: ...]` — the model is
// never told this syntax, so events can't be prompted into existence. The
// client also synthesizes the same shape for client-driven passes (self-heal,
// design check) so the feed renders uniformly regardless of where a pass ran.
// Pure module: no React, no network (same convention as staged-plan.ts).

export type AgentId =
  | 'planner'
  | 'coder'
  | 'design'
  | 'security'
  | 'qa'
  | 'orchestrator'

export type AgentStatus =
  | 'start'
  | 'progress'
  | 'finding'
  | 'fixing'
  | 'fixed'
  | 'pass'
  | 'done'
  | 'blocked'
  | 'stuck'

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface AgentEvent {
  agent: AgentId
  status: AgentStatus
  /** Human-readable line shown in the feed. */
  detail?: string
  severity?: FindingSeverity
  /** Stable id so a later 'fixed'/'blocked' event (or a user action) can reference a finding. */
  findingId?: string
  /** Internal pass number within the turn (1-based). */
  pass?: number
}

const AGENT_IDS = new Set<string>(['planner', 'coder', 'design', 'security', 'qa', 'orchestrator'])
const STATUSES = new Set<string>(['start', 'progress', 'finding', 'fixing', 'fixed', 'pass', 'done', 'blocked', 'stuck'])

// One event per marker; payload is a single-line JSON object.
export const AGENT_EVENT_RE = /\[agent:(\{[^\n\]]*\})\]/g

export function formatAgentEvent(e: AgentEvent): string {
  return `\n[agent:${JSON.stringify(e)}]\n`
}

/**
 * Extract every well-formed agent event from raw stream text, in order.
 * Malformed JSON or unknown agent/status values are skipped silently —
 * the stream must never break because of a bad marker.
 */
export function extractAgentEvents(raw: string): AgentEvent[] {
  if (!raw || raw.indexOf('[agent:') === -1) return []
  const events: AgentEvent[] = []
  const re = new RegExp(AGENT_EVENT_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (!parsed || typeof parsed !== 'object') continue
      const agent = String(parsed.agent || '')
      const status = String(parsed.status || '')
      if (!AGENT_IDS.has(agent) || !STATUSES.has(status)) continue
      const ev: AgentEvent = { agent: agent as AgentId, status: status as AgentStatus }
      if (typeof parsed.detail === 'string') ev.detail = parsed.detail.slice(0, 300)
      if (typeof parsed.severity === 'string' && ['critical', 'high', 'medium', 'low'].includes(parsed.severity)) {
        ev.severity = parsed.severity as FindingSeverity
      }
      if (typeof parsed.findingId === 'string') ev.findingId = parsed.findingId.slice(0, 64)
      if (typeof parsed.pass === 'number' && Number.isFinite(parsed.pass)) ev.pass = parsed.pass
      events.push(ev)
    } catch {
      // skip malformed marker
    }
  }
  return events
}

/** Remove agent markers from display/persisted text. Safe on any string. */
export function stripAgentEvents(raw: string): string {
  if (!raw || raw.indexOf('[agent:') === -1) return raw
  return raw.replace(new RegExp(AGENT_EVENT_RE.source, 'g'), '')
}

// ---------------------------------------------------------------------------
// UI derivation

export type LaneState = 'idle' | 'working' | 'done' | 'blocked'

export interface AgentLaneFinding {
  findingId?: string
  severity: FindingSeverity
  detail: string
  /** finding → (fixing) → fixed | blocked; findings with no follow-up stay 'flagged'. */
  resolution: 'fixed' | 'blocked' | 'flagged'
}

export interface AgentLane {
  agent: AgentId
  state: LaneState
  /** Most recent human-readable status line. */
  lastStatus: string
  findings: AgentLaneFinding[]
}

/**
 * Fold an event list into per-agent lanes for the feed UI.
 * Lane order = order of each agent's first appearance.
 */
export function deriveAgentLanes(events: AgentEvent[]): AgentLane[] {
  const lanes = new Map<AgentId, AgentLane>()
  for (const e of events) {
    let lane = lanes.get(e.agent)
    if (!lane) {
      lane = { agent: e.agent, state: 'working', lastStatus: '', findings: [] }
      lanes.set(e.agent, lane)
    }
    switch (e.status) {
      case 'done':
        lane.state = 'done'
        if (e.detail) lane.lastStatus = e.detail
        break
      case 'stuck':
      case 'blocked':
        lane.state = 'blocked'
        if (e.detail) lane.lastStatus = e.detail
        break
      case 'finding': {
        lane.state = 'working'
        lane.findings.push({
          findingId: e.findingId,
          severity: e.severity || 'medium',
          detail: e.detail || 'issue found',
          resolution: 'flagged',
        })
        break
      }
      case 'fixed': {
        lane.state = 'working'
        const target = e.findingId
          ? lane.findings.find(f => f.findingId === e.findingId)
          : lane.findings.filter(f => f.resolution === 'flagged').pop()
        if (target) {
          target.resolution = 'fixed'
          if (e.detail) target.detail = e.detail
        } else {
          lane.findings.push({
            findingId: e.findingId,
            severity: e.severity || 'medium',
            detail: e.detail || 'issue fixed',
            resolution: 'fixed',
          })
        }
        if (e.detail) lane.lastStatus = e.detail
        break
      }
      default:
        lane.state = 'working'
        if (e.detail) lane.lastStatus = e.detail
    }
  }
  return Array.from(lanes.values())
}

/** Highest pass number seen in the event list (0 if none). */
export function maxPass(events: AgentEvent[]): number {
  let n = 0
  for (const e of events) if (typeof e.pass === 'number' && e.pass > n) n = e.pass
  return n
}
