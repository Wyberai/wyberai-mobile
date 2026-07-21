import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FadeInUp } from '@/components/FadeInUp';
import { agentMeta } from '@/lib/agents/roster';
import type { AgentLane, FindingSeverity } from '@/lib/agents/events';
import { brand, radius, space } from '@/lib/theme';

// Live status feed for the agent team (Atlas/Forge/Prism/Sentinel/Verity) —
// mobile counterpart to the web ChatPanel's agent lanes. Renders whatever
// lanes deriveAgentLanes() produced from this turn's [agent:{json}] events;
// purely presentational, same as BuildTheater. Mount only when
// AGENT_TEAM_ENABLED && lanes.length > 0 (caller's responsibility).

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  critical: brand.danger,
  high: brand.danger,
  medium: brand.warning,
  low: brand.textMuted,
};

const STATE_ICON: Record<AgentLane['state'], keyof typeof Ionicons.glyphMap> = {
  idle: 'ellipse-outline',
  working: 'sync-outline',
  done: 'checkmark-circle',
  blocked: 'alert-circle',
};

const STATE_COLOR: Record<AgentLane['state'], string> = {
  idle: brand.textFaint,
  working: brand.accent,
  done: brand.success,
  blocked: brand.danger,
};

export function AgentFeed({ lanes }: { lanes: AgentLane[] }) {
  if (lanes.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {lanes.map((lane, i) => {
        const meta = agentMeta(lane.agent);
        return (
          <FadeInUp key={lane.agent} distance={10} duration={250} delay={i * 40}>
            <View style={styles.lane}>
              <View style={[styles.avatar, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
                <Ionicons name={STATE_ICON[lane.state]} size={13} color={STATE_COLOR[lane.state]} />
              </View>
              <View style={styles.laneBody}>
                <View style={styles.laneHeader}>
                  <Text style={[styles.name, { color: meta.color }]}>{meta.name}</Text>
                  <Text style={styles.role}>{meta.role}</Text>
                </View>
                {lane.lastStatus ? (
                  <Text style={styles.status} numberOfLines={2}>{lane.lastStatus}</Text>
                ) : null}
                {lane.findings.map((f, fi) => (
                  <View key={f.findingId ?? fi} style={styles.findingRow}>
                    <View style={[styles.dot, { backgroundColor: SEVERITY_COLOR[f.severity] }]} />
                    <Text style={styles.findingText} numberOfLines={2}>{f.detail}</Text>
                    <Text
                      style={[
                        styles.resolution,
                        f.resolution === 'fixed' && { color: brand.success },
                        f.resolution === 'blocked' && { color: brand.danger },
                      ]}
                    >
                      {f.resolution}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeInUp>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.sm },
  lane: {
    flexDirection: 'row', gap: space.sm,
    backgroundColor: brand.surfaceAlt, borderRadius: radius.md,
    borderWidth: 1, borderColor: brand.border, padding: space.sm + 2,
  },
  avatar: {
    width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  laneBody: { flex: 1, gap: 3 },
  laneHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontSize: 13, fontWeight: '700' },
  role: { fontSize: 11, color: brand.textFaint },
  status: { fontSize: 12.5, color: brand.textMuted, lineHeight: 17 },
  findingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  findingText: { flex: 1, fontSize: 12, color: brand.textMuted },
  resolution: { fontSize: 10.5, fontWeight: '700', color: brand.textFaint, textTransform: 'uppercase' },
});
