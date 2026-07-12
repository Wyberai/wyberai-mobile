import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import {
  applyGeneration,
  loadMessages,
  planProject,
  planToSpec,
  saveFiles,
  saveMessage,
  saveVersion,
  streamGenerate,
  type FileMap,
  type Plan,
  type ProjectType,
} from '@/lib/api';
import { thunk, warn } from '@/lib/haptics';
import { cleanStreamingDisplay, extractProgressLines } from '@/lib/file-parser';
import { brand, radius, space } from '@/lib/theme';

type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; progress?: string[]; streaming?: boolean };

export default function BuildScreen() {
  const { id, prompt: initialPrompt } = useLocalSearchParams<{ id: string; prompt?: string }>();
  const router = useRouter();
  // Credits come from the shared session context (single source, auto-refreshed
  // on app foreground) so a web top-up reflects here too.
  const { user, credits, refreshCredits } = useSession();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('web');
  const [files, setFiles] = useState<FileMap>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Plan Mode: on a first build, offer a plan before generating code.
  const [planState, setPlanState] = useState<'none' | 'offer' | 'planning' | 'ready'>('none');
  const [plan, setPlan] = useState<Plan | null>(null);
  const pendingPrompt = useRef('');
  const handleRef = useRef<{ abort: () => void } | null>(null);
  const firedInitial = useRef(false);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    if (!id) return;
    // Project meta/files and chat history load in parallel; the screen unlocks
    // when the project arrives (history fills in whenever it lands — usually
    // together, and an empty/failed history read must never block building).
    supabase
      .from('projects')
      .select('id,name,project_type,files')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.name ?? '');
          setType((data.project_type as ProjectType) ?? 'web');
          setFiles((data.files as FileMap) ?? {});
        }
        setLoaded(true);
      });
    loadMessages(id).then((stored) => {
      if (stored.length === 0) return;
      setMessages((current) => {
        // Never clobber a conversation that already started this session
        // (e.g. the initial-prompt build fired before history arrived).
        if (current.length > 0) return current;
        return stored.map((m) =>
          m.role === 'user'
            ? { id: m.id, role: 'user' as const, text: m.content }
            : { id: m.id, role: 'assistant' as const, text: m.content },
        );
      });
    });
    refreshCredits();
  }, [id, refreshCredits]);

  const run = useCallback(
    (promptText: string, displayText?: string) => {
      if (!id || !user?.id || busy || !promptText.trim()) return;
      const prompt = promptText.trim();
      setInput('');
      setBusy(true);
      thunk();

      // displayText lets the chat bubble show the user's own words while the
      // model receives a richer spec (used by Plan Mode → build).
      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: (displayText ?? prompt).trim() };
      const aId = `a${Date.now()}`;
      const assistant: Msg = { id: aId, role: 'assistant', text: '', progress: [], streaming: true };
      // Conversation context for the model: the last few turns BEFORE this one
      // (same shape the web ChatPanel sends). Persist the user turn immediately
      // so history survives even if the build is cancelled mid-stream.
      const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
      setMessages((m) => [...m, userMsg, assistant]);
      saveMessage(id, 'user', userMsg.text, { clientId: userMsg.id });

      handleRef.current = streamGenerate(
        { prompt, projectId: id, userId: user.id, projectType: type, files, history },
        {
          onText: (full) => {
            const shown = cleanStreamingDisplay(full);
            const progress = extractProgressLines(full);
            setMessages((m) =>
              m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: shown, progress } : x)),
            );
          },
          onDone: async (full) => {
            try {
              const { files: next, chatText, changed } = applyGeneration(files, full);
              // Never persist an empty project. If the generation produced no
              // files (a truncated / errored / chat-only response), keep the
              // existing files and prompt a retry instead of silently saving {} —
              // that was leaving behind unbuildable 0-file projects.
              if (Object.keys(next).length === 0) {
                setMessages((m) =>
                  m.map((x) =>
                    x.id === aId && x.role === 'assistant'
                      ? { ...x, text: chatText || "That didn't produce an app — tap send to try again.", streaming: false }
                      : x,
                  ),
                );
                setBusy(false);
                return;
              }
              setFiles(next);
              await saveFiles(id, next);
              setMessages((m) =>
                m.map((x) =>
                  x.id === aId && x.role === 'assistant'
                    ? { ...x, text: chatText || 'Done.', streaming: false }
                    : x,
                ),
              );
              // Lovable-parity persistence: the assistant turn goes to chat
              // history, and the new file state becomes a restorable version.
              // Both best-effort — the build already succeeded.
              saveMessage(id, 'assistant', chatText || 'Done.', { filesChanged: changed, clientId: aId });
              saveVersion(id, next, userMsg.text);
            } catch (e) {
              setMessages((m) =>
                m.map((x) =>
                  x.id === aId && x.role === 'assistant'
                    ? { ...x, text: `Saved on server, but: ${(e as Error).message}`, streaming: false }
                    : x,
                ),
              );
            } finally {
              setBusy(false);
              refreshCredits();
            }
          },
          onError: (msg) => {
            warn();
            // Turn the raw "Build failed (402): Not enough credits…" into a calm
            // nudge to top up on the web (where credits are bought via Dodo).
            const outOfCredits = /\b402\b|not enough credits|insufficient/i.test(msg);
            const shown = outOfCredits
              ? "You're out of credits. Buy more to keep building — your credits work across web and mobile."
              : msg;
            setMessages((m) =>
              m.map((x) =>
                x.id === aId && x.role === 'assistant' ? { ...x, text: shown, streaming: false } : x,
              ),
            );
            if (outOfCredits) {
              Alert.alert('Out of credits', 'Buy more credits to keep building.', [
                { text: 'Not now', style: 'cancel' },
                { text: 'Buy credits', onPress: () => router.push('/paywall') },
              ]);
            }
            setBusy(false);
            refreshCredits();
          },
        },
      );
    },
    [id, user?.id, busy, type, files, messages, refreshCredits],
  );

  // Cancel an in-flight build — abort the stream, unlock the UI, and close out
  // the streaming bubble. Guarantees recovery even if the network never replies.
  const cancel = useCallback(() => {
    handleRef.current?.abort();
    handleRef.current = null;
    setBusy(false);
    setMessages((m) =>
      m.map((x) =>
        x.role === 'assistant' && x.streaming
          ? { ...x, streaming: false, text: x.text || 'Build cancelled.' }
          : x,
      ),
    );
  }, []);

  // Abort any in-flight build if the user leaves the screen.
  useEffect(() => () => handleRef.current?.abort(), []);

  // Plan Mode handlers.
  const justBuild = useCallback(() => {
    const p = pendingPrompt.current;
    setPlanState('none');
    run(p);
  }, [run]);

  const seePlan = useCallback(async () => {
    setPlanState('planning');
    try {
      const p = await planProject(pendingPrompt.current, type);
      setPlan(p);
      setPlanState('ready');
      refreshCredits();
    } catch (e) {
      setPlanState('offer');
      Alert.alert('Couldn’t plan', (e as Error).message, [{ text: 'OK' }]);
    }
  }, [type, refreshCredits]);

  const buildFromPlan = useCallback(() => {
    if (!plan) return;
    const spec = planToSpec(plan, pendingPrompt.current);
    setPlanState('none');
    run(spec, pendingPrompt.current); // model gets the spec; bubble shows the user's words
  }, [plan, run]);

  // On a FIRST build, offer a plan instead of generating immediately; follow-up
  // edits (project already has files) build directly.
  useEffect(() => {
    if (loaded && !firedInitial.current && initialPrompt && typeof initialPrompt === 'string') {
      firedInitial.current = true;
      if (Object.keys(files).length === 0) {
        pendingPrompt.current = initialPrompt;
        setPlanState('offer');
      } else {
        run(initialPrompt);
      }
    }
  }, [loaded, initialPrompt, run, files]);

  const hasFiles = Object.keys(files).length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: name || 'Builder',
          headerRight: () => (
            <View style={styles.headerRow}>
              {credits !== null ? (
                <Pressable onPress={() => router.push('/account')} hitSlop={8} style={styles.creditsChip}>
                  <Ionicons name="flash" size={12} color={brand.accent} />
                  <Text style={styles.creditsText}>{credits.toLocaleString()}</Text>
                </Pressable>
              ) : null}
              {hasFiles ? (
                <Pressable
                  onPress={() =>
                    Alert.alert('Project tools', undefined, [
                      { text: '🎨 Themes (free)', onPress: () => router.push(`/themes/${id}`) },
                      { text: '🕘 Version history', onPress: () => router.push(`/versions/${id}`) },
                      { text: '📄 View code', onPress: () => router.push(`/code/${id}`) },
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  hitSlop={8}
                >
                  <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={brand.textMuted} />
                </Pressable>
              ) : null}
              {hasFiles ? (
                <Pressable onPress={() => router.push(`/preview/${id}`)} hitSlop={8} style={styles.previewBtn}>
                  <Ionicons name="play" size={14} color={brand.onAccent} />
                  <Text style={styles.previewBtnText}>Preview</Text>
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : planState !== 'none' ? (
        <PlanPanel
          state={planState}
          plan={plan}
          type={type}
          onSeePlan={seePlan}
          onJustBuild={justBuild}
          onBuildFromPlan={buildFromPlan}
        />
      ) : (
        <FlatList
          ref={listRef}
          style={styles.flex}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="sparkles-outline" size={36} color={brand.textFaint} />
              <Text style={styles.emptyTitle}>Describe what to build</Text>
              <Text style={styles.emptyBody}>
                e.g. &quot;a habit tracker with streaks&quot; — {type === 'mobile' ? 'a mobile app' : 'a web app'}.
              </Text>
            </View>
          }
          renderItem={({ item }) => <MessageBubble msg={item} />}
        />
      )}

      {planState === 'none' && (
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={hasFiles ? 'Describe a change…' : 'Describe your app…'}
          placeholderTextColor={brand.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          editable={!busy}
        />
        <Pressable
          onPress={busy ? cancel : () => run(input)}
          disabled={!busy && !input.trim()}
          accessibilityLabel={busy ? 'Cancel build' : 'Send'}
          style={({ pressed }) => [
            styles.send,
            !busy && !input.trim() && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          {busy ? (
            <Ionicons name="stop" size={18} color={brand.onAccent} />
          ) : (
            <Ionicons name="arrow-up" size={20} color={brand.onAccent} />
          )}
        </Pressable>
      </View>
      )}
    </KeyboardAvoidingView>
  );
}

function PlanPanel({
  state,
  plan,
  type,
  onSeePlan,
  onJustBuild,
  onBuildFromPlan,
}: {
  state: 'offer' | 'planning' | 'ready';
  plan: Plan | null;
  type: ProjectType;
  onSeePlan: () => void;
  onJustBuild: () => void;
  onBuildFromPlan: () => void;
}) {
  if (state === 'planning') {
    return (
      <View style={ps.center}>
        <ActivityIndicator color={brand.accent} />
        <Text style={ps.planningText}>Thinking through the plan…</Text>
      </View>
    );
  }

  if (state === 'offer') {
    return (
      <View style={ps.center}>
        <Ionicons name="map-outline" size={40} color={brand.accent} />
        <Text style={ps.title}>Plan it first?</Text>
        <Text style={ps.body}>
          See the features and screens before building a {type === 'mobile' ? 'mobile app' : 'web app'} —
          fewer wasted builds.
        </Text>
        <Pressable style={ps.primary} onPress={onSeePlan}>
          <Ionicons name="sparkles" size={16} color={brand.onAccent} />
          <Text style={ps.primaryText}>Show me a plan · 5 credits</Text>
        </Pressable>
        <Pressable style={ps.ghost} onPress={onJustBuild}>
          <Text style={ps.ghostText}>Just build it</Text>
        </Pressable>
      </View>
    );
  }

  if (!plan) return null;
  return (
    <ScrollView contentContainerStyle={ps.scroll}>
      <Text style={ps.planTitle}>{plan.title}</Text>
      <Text style={ps.approach}>{plan.approach}</Text>

      {plan.flow.screens.length > 0 ? (
        <View style={ps.flowRow}>
          {plan.flow.screens.map((s, i) => (
            <View key={s.id} style={ps.flowItem}>
              <Text style={ps.flowText}>{s.name}</Text>
              {i < plan.flow.screens.length - 1 ? <Text style={ps.flowArrow}>→</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Text style={ps.sectionLabel}>FEATURES</Text>
      {plan.features.map((f) => (
        <View key={f.id} style={ps.feature}>
          <Text style={ps.featureTitle}>{f.title}</Text>
          <Text style={ps.featureDesc}>{f.description}</Text>
        </View>
      ))}

      {plan.warnings.length > 0 ? (
        <View style={ps.warnBox}>
          {plan.warnings.map((w, i) => (
            <Text key={i} style={ps.warnText}>
              • {w}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable style={ps.primary} onPress={onBuildFromPlan}>
        <Ionicons name="hammer" size={16} color={brand.onAccent} />
        <Text style={ps.primaryText}>Build this</Text>
      </Pressable>
      <Pressable style={ps.ghost} onPress={onJustBuild}>
        <Text style={ps.ghostText}>Skip — build from my prompt</Text>
      </Pressable>
    </ScrollView>
  );
}

const ps = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  planningText: { color: brand.textMuted, fontSize: 14, marginTop: space.sm },
  title: { color: brand.text, fontSize: 20, fontWeight: '700', marginTop: space.sm },
  body: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  scroll: { padding: space.lg, gap: space.sm },
  planTitle: { color: brand.text, fontSize: 22, fontWeight: '800' },
  approach: { color: brand.textMuted, fontSize: 14, lineHeight: 21, marginBottom: space.sm },
  flowRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: space.sm },
  flowItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowText: {
    color: brand.text, fontSize: 12, fontWeight: '600',
    backgroundColor: brand.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden',
  },
  flowArrow: { color: brand.textFaint, fontSize: 14 },
  sectionLabel: { color: brand.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: space.sm },
  feature: {
    backgroundColor: brand.surface, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border,
    padding: space.md, gap: 3,
  },
  featureTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  featureDesc: { color: brand.textMuted, fontSize: 13, lineHeight: 19 },
  warnBox: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', padding: space.md, gap: 4, marginTop: space.xs,
  },
  warnText: { color: brand.warning, fontSize: 13, lineHeight: 19 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: 13, marginTop: space.md,
  },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
});

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{msg.text}</Text>
      </View>
    );
  }
  const progress = msg.progress ?? [];
  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      {progress.length > 0 && msg.streaming ? (
        <View style={styles.progressWrap}>
          {progress.map((p, i) => (
            <View key={i} style={styles.progressRow}>
              <Ionicons
                name={i === progress.length - 1 ? 'ellipse-outline' : 'checkmark-circle'}
                size={14}
                color={i === progress.length - 1 ? brand.textMuted : brand.success}
              />
              <Text style={styles.progressText}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {msg.text ? <Text style={styles.aiText}>{msg.text}</Text> : null}
      {msg.streaming && !msg.text && progress.length === 0 ? (
        <View style={styles.thinkingRow}>
          <ActivityIndicator color={brand.accent} size="small" />
          <Text style={styles.progressText}>Building…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, minHeight: 300 },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listContent: { padding: space.lg, gap: space.md },
  bubble: { borderRadius: radius.lg, padding: space.md, maxWidth: '92%' },
  userBubble: { backgroundColor: brand.accent, alignSelf: 'flex-end' },
  userText: { color: brand.onAccent, fontSize: 15, lineHeight: 21 },
  aiBubble: { backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border, alignSelf: 'flex-start' },
  aiText: { color: brand.text, fontSize: 15, lineHeight: 21 },
  progressWrap: { gap: 6, marginBottom: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressText: { color: brand.textMuted, fontSize: 13 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    backgroundColor: brand.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendPressed: { backgroundColor: brand.accentDim },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  creditsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  creditsText: { color: brand.text, fontSize: 13, fontWeight: '700' },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: brand.accent,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  previewBtnText: { color: brand.onAccent, fontSize: 13, fontWeight: '700' },
});
