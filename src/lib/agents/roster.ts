// The named agent personas. One place to rename/recolor the team.
// Unknown agent ids resolve to a generic fallback so the server can introduce
// new agents without a client release.

import type { AgentId } from './events'

export interface AgentMeta {
  id: AgentId | string
  /** Persona name shown in the feed. */
  name: string
  /** Role label shown next to the name. */
  role: string
  /** Accent color (hex) for avatar/status. */
  color: string
}

export const AGENT_TEAM: Record<AgentId, AgentMeta> = {
  planner: { id: 'planner', name: 'Atlas', role: 'Planner', color: '#0EA5E9' },
  coder: { id: 'coder', name: 'Forge', role: 'Coder', color: '#F59E0B' },
  design: { id: 'design', name: 'Prism', role: 'Designer', color: '#A78BFA' },
  security: { id: 'security', name: 'Sentinel', role: 'Security', color: '#22C55E' },
  qa: { id: 'qa', name: 'Verity', role: 'QA', color: '#F472B6' },
  orchestrator: { id: 'orchestrator', name: 'Wyber', role: 'Lead', color: '#94A3B8' },
}

export function agentMeta(id: string): AgentMeta {
  return (AGENT_TEAM as Record<string, AgentMeta>)[id] || { id, name: id, role: 'Agent', color: '#94A3B8' }
}

/** Client flag: agent-team UI + client orchestration. */
export const AGENT_TEAM_ENABLED = process.env.EXPO_PUBLIC_AGENT_TEAM === 'true'
