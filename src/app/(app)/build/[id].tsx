import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  buildPreview,
  saveFiles,
  streamGenerate,
  type FileMap,
  type ProjectType,
} from '@/lib/api';
import { cleanStreamingDisplay, extractProgressLines } from '@/lib/file-parser';
import { brand, radius, space } from '@/lib/theme';

type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; progress?: string[]; streaming?: boolean };

export default function BuildScreen() {
  const { id, prompt: initialPrompt } = useLocalSearchParams<{ id: string; prompt?: string }>();
  const router = useRouter();
  const { user } = useSession();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('web');
  const [files, setFiles] = useState<FileMap>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const handleRef = useRef<{ abort: () => void } | null>(null);
  const firedInitial = useRef(false);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    if (!id) return;
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
  }, [id]);

  const run = useCallback(
    (promptText: string) => {
      if (!id || !user?.id || busy || !promptText.trim()) return;
      const prompt = promptText.trim();
      setInput('');
      setBusy(true);

      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: prompt };
      const aId = `a${Date.now()}`;
      const assistant: Msg = { id: aId, role: 'assistant', text: '', progress: [], streaming: true };
      setMessages((m) => [...m, userMsg, assistant]);

      handleRef.current = streamGenerate(
        { prompt, projectId: id, userId: user.id, projectType: type, files },
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
              const { files: next, chatText } = applyGeneration(files, full);
              setFiles(next);
              await saveFiles(id, next);
              setMessages((m) =>
                m.map((x) =>
                  x.id === aId && x.role === 'assistant'
                    ? { ...x, text: chatText || 'Done.', streaming: false }
                    : x,
                ),
              );
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
            }
          },
          onError: (msg) => {
            setMessages((m) =>
              m.map((x) =>
                x.id === aId && x.role === 'assistant' ? { ...x, text: msg, streaming: false } : x,
              ),
            );
            setBusy(false);
          },
        },
      );
    },
    [id, user?.id, busy, type, files],
  );

  // Auto-fire the initial prompt passed from the "New app" screen, once.
  useEffect(() => {
    if (loaded && !firedInitial.current && initialPrompt && typeof initialPrompt === 'string') {
      firedInitial.current = true;
      run(initialPrompt);
    }
  }, [loaded, initialPrompt, run]);

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
          headerRight: () =>
            hasFiles ? (
              <Pressable onPress={() => router.push(`/preview/${id}`)} hitSlop={8} style={styles.previewBtn}>
                <Ionicons name="play" size={14} color={brand.onAccent} />
                <Text style={styles.previewBtnText}>Preview</Text>
              </Pressable>
            ) : null,
        }}
      />

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={brand.accent} />
        </View>
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
          onPress={() => run(input)}
          disabled={busy || !input.trim()}
          style={({ pressed }) => [
            styles.send,
            (busy || !input.trim()) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={brand.onAccent} size="small" />
          ) : (
            <Ionicons name="arrow-up" size={20} color={brand.onAccent} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

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
