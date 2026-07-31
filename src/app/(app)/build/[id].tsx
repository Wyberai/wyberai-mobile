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
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import {
  applyGeneration,
  buildMobilePreviewHtml,
  buildPreview,
  loadMessages,
  resolveImages,
  planProject,
  planToSpec,
  saveFiles,
  saveMessage,
  saveVersion,
  streamGenerate,
  fetchSuggestions,
  exportProjectZip,
  getGithubRepoStatus,
  pushToGithub,
  type FileMap,
  type Plan,
  type ProjectType,
  type Suggestion,
} from '@/lib/api';
import * as Sharing from 'expo-sharing';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImagesPanelSheet } from '@/components/ImagesPanelSheet';
import { KnowledgeSheet } from '@/components/KnowledgeSheet';
import { useToast } from '@/components/Toast';
import { thunk, warn } from '@/lib/haptics';
import { cleanStreamingDisplay, extractProgressLines } from '@/lib/file-parser';
import { extractAgentEvents, deriveAgentLanes, type AgentLane } from '@/lib/agents/events';
import { AGENT_TEAM_ENABLED } from '@/lib/agents/roster';
import { BottomSheet } from '@/components/BottomSheet';
import { BuildTheater } from '@/components/BuildTheater';
import { AgentFeed } from '@/components/AgentFeed';
import { ConnectorsSheet } from '@/components/ConnectorsSheet';
import { MicButton } from '@/components/MicButton';
import { PreviewRevealSheet, type RevealState, type RuntimeErrorInfo } from '@/components/PreviewRevealSheet';
import { FileMentionPicker } from '@/components/FileMentionPicker';
import { StreamingText } from '@/components/StreamingText';
import { SafeWidget } from '@/components/SafeWidget';
import { useT } from '@/lib/i18n/useT';
import { BUILD_SCREEN_STRINGS } from '@/lib/i18n/dict/build-screen';
import { brand, radius, space } from '@/lib/theme';

// Turns a caught preview runtime error into a standard repair instruction —
// same idea as the web app's auto-fix chat turn, just built client-side here
// since the mobile app has no equivalent server hook to generate one.
const BUILD_COUNT_KEY = 'wyber:build-count';
const REVIEW_PROMPTED_AT_KEY = 'wyber:review-prompted-at';
const REVIEW_PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

// Ask for a store review after a successful build, at most once per 90 days,
// and never before the user has actually shipped a few things (build 3+) —
// asking after their very first build is asking before they trust the product.
async function maybePromptReview() {
  try {
    const countRaw = await AsyncStorage.getItem(BUILD_COUNT_KEY);
    const count = (parseInt(countRaw ?? '0', 10) || 0) + 1;
    await AsyncStorage.setItem(BUILD_COUNT_KEY, String(count));
    if (count < 3) return;

    const promptedAtRaw = await AsyncStorage.getItem(REVIEW_PROMPTED_AT_KEY);
    const promptedAt = promptedAtRaw ? parseInt(promptedAtRaw, 10) : 0;
    if (Date.now() - promptedAt < REVIEW_PROMPT_COOLDOWN_MS) return;

    if (!(await StoreReview.isAvailableAsync())) return;
    await StoreReview.requestReview();
    await AsyncStorage.setItem(REVIEW_PROMPTED_AT_KEY, String(Date.now()));
  } catch {
    // Store review is a nicety — never let it throw into a build's success path.
  }
}

function autoFixPrompt(err: RuntimeErrorInfo): string {
  const location = err.source ? ` (at ${err.source}${err.line ? `:${err.line}` : ''})` : '';
  const stack = err.stack ? `\n\nStack trace:\n${err.stack.slice(0, 1500)}` : '';
  return `The app preview threw a runtime error — please fix it.\n\nError: ${err.message}${location}${stack}`;
}

type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; progress?: string[]; agentLanes?: AgentLane[]; streaming?: boolean }
  | { id: string; role: 'suggestions'; items: Suggestion[] };

export default function BuildScreen() {
  const { id, prompt: initialPrompt } = useLocalSearchParams<{ id: string; prompt?: string }>();
  const router = useRouter();
  const t = useT(BUILD_SCREEN_STRINGS);
  // Credits come from the shared session context (single source, auto-refreshed
  // on app foreground) so a web top-up reflects here too.
  const { user, credits, refreshCredits } = useSession();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('web');
  const [files, setFiles] = useState<FileMap>({});
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
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
  const inputRef = useRef<TextInput>(null);
  // Staged photo attachment — set by the camera button, consumed and cleared
  // by the next run() (a ref, not state, so every existing run() call site —
  // Plan Mode, suggestion chips, connectors — doesn't need to thread it through).
  type PendingImage = { base64: string; mimeType: string; previewUri: string };
  const pendingImageRef = useRef<PendingImage | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);

  const processPickedAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    // Only downscale if it's actually bigger than the cap — a small screenshot
    // shouldn't get upscaled/re-encoded for no reason. `quality` alone only
    // controls JPEG compression, not pixel dimensions — a straight-from-camera
    // 12-48MP photo would still ship whole as base64 in the /api/generate
    // body and could hang the request without this resize step.
    const MAX_DIM = 1280;
    const needsResize = (asset.width ?? 0) > MAX_DIM || (asset.height ?? 0) > MAX_DIM;
    const wide = (asset.width ?? 0) >= (asset.height ?? 0);
    const resized = await ImageManipulator.manipulateAsync(
      asset.uri,
      needsResize ? [{ resize: wide ? { width: MAX_DIM } : { height: MAX_DIM } }] : [],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!resized.base64) return;
    pendingImageRef.current = { base64: resized.base64, mimeType: 'image/jpeg', previewUri: resized.uri };
    setPendingImagePreview(resized.uri);
  }, []);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ base64: false, quality: 1, allowsEditing: false });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;
    await processPickedAsset(asset);
  }, [processPickedAsset]);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: false,
      quality: 1,
      allowsEditing: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;
    await processPickedAsset(asset);
  }, [processPickedAsset]);

  // The camera icon implied live capture, but only ever opened the photo
  // library — offer both, matching what the icon promises.
  const pickImage = useCallback(() => {
    Alert.alert('Attach a photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [takePhoto, pickFromLibrary]);

  const clearPendingImage = useCallback(() => {
    pendingImageRef.current = null;
    setPendingImagePreview(null);
  }, []);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);
  const showToast = useToast();
  // The reveal moment: after a build lands, the app auto-renders in a slide-up
  // sheet. Purely additive — every await mutates only this state, and the
  // whole surface is SafeWidget'd, so a preview failure can't touch chat.
  const [reveal, setReveal] = useState<RevealState>({ phase: 'hidden' });
  // Surfaced by the reveal sheet's WebView error bridge — powers the AutoFix
  // banner offering to send the error straight back into the chat as a repair
  // prompt. Cleared whenever a new build starts (run()) or the preview
  // silently re-renders (autoPreview()) since either makes the previous error stale.
  const [autoFixError, setAutoFixError] = useState<RuntimeErrorInfo | null>(null);
  const goneRef = useRef(false);
  useEffect(() => () => { goneRef.current = true; }, []);

  const autoPreview = useCallback(
    async (nextFiles: FileMap) => {
      if (!id || goneRef.current || Object.keys(nextFiles).length === 0) return;
      // Any fresh render (including a silent background reload after images
      // resolve or a manual regenerate) can change or fix what's on screen —
      // a banner about an error from the PREVIOUS render must not linger and
      // imply the new one is still broken.
      setAutoFixError(null);
      setReveal({ phase: 'building' });
      try {
        if (type === 'mobile') {
          const html = await buildMobilePreviewHtml(id, nextFiles);
          if (!goneRef.current) setReveal({ phase: 'ready-html', html });
        } else {
          const url = await buildPreview(id, nextFiles);
          if (!goneRef.current) setReveal({ phase: 'ready', url });
        }
        if (!goneRef.current) thunk();
      } catch {
        if (!goneRef.current) setReveal({ phase: 'error' });
      }
    },
    [id, type, name],
  );

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
        if (goneRef.current) return;
        if (data) {
          setName(data.name ?? '');
          setType((data.project_type as ProjectType) ?? 'web');
          setFiles((data.files as FileMap) ?? {});
        }
        setLoaded(true);
      });
    loadMessages(id).then((stored) => {
      if (goneRef.current || stored.length === 0) return;
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

  // `busy` state alone isn't enough to block a double-tap — React doesn't
  // commit the setBusy(true) below synchronously, so two taps landing in the
  // same event-loop turn (fast double-tap on Send or "Fix it") can both pass
  // the `busy` check before either has re-rendered. This ref closes that gap.
  const runningRef = useRef(false);
  const run = useCallback(
    (promptText: string, displayText?: string, opts?: { consumeImage?: boolean }) => {
      if (!id || !user?.id || busy || runningRef.current || !promptText.trim()) return;
      runningRef.current = true;
      const prompt = promptText.trim();
      setInput('');
      setBusy(true);
      setAutoFixError(null);
      thunk();

      // displayText lets the chat bubble show the user's own words while the
      // model receives a richer spec (used by Plan Mode → build).
      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: (displayText ?? prompt).trim() };
      const aId = `a${Date.now()}`;
      const assistant: Msg = { id: aId, role: 'assistant', text: '', progress: [], streaming: true };
      // Conversation context for the model: the last few turns BEFORE this one
      // (same shape the web ChatPanel sends). Persist the user turn immediately
      // so history survives even if the build is cancelled mid-stream.
      const history = messages
        .filter((m): m is Extract<Msg, { role: 'user' | 'assistant' }> => m.role !== 'suggestions')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text }));
      setMessages((m) => [...m, userMsg, assistant]);
      saveMessage(id, 'user', userMsg.text, { clientId: userMsg.id });

      // AutoFix and the Connectors sheet fire their own generated prompts —
      // a photo the user staged for their OWN next message must not get
      // silently spent on one of those instead (it would just vanish with no
      // indication why, and the user's real message would send without it).
      const consumeImage = opts?.consumeImage ?? true;
      const image = consumeImage && pendingImageRef.current
        ? { base64: pendingImageRef.current.base64, mimeType: pendingImageRef.current.mimeType }
        : undefined;
      if (consumeImage) clearPendingImage();

      handleRef.current = streamGenerate(
        { prompt, projectId: id, userId: user.id, projectType: type, files, history, image },
        {
          onText: (full) => {
            const shown = cleanStreamingDisplay(full);
            const progress = extractProgressLines(full);
            // Agent-team lanes: off (AGENT_TEAM_ENABLED=false) means the server
            // never emits [agent:...] markers, so this is always a no-op then.
            const agentLanes = AGENT_TEAM_ENABLED ? deriveAgentLanes(extractAgentEvents(full)) : undefined;
            setMessages((m) =>
              m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: shown, progress, agentLanes } : x)),
            );
          },
          onDone: async (full) => {
            if (goneRef.current) return;
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
                      ? { ...x, text: chatText || t('thatDidntWork'), streaming: false }
                      : x,
                  ),
                );
                setBusy(false);
                runningRef.current = false;
                return;
              }
              setFiles(next);
              await saveFiles(id, next);
              // The screen may have been left mid-save (fast back-swipe right
              // after Send) — everything past this point is chat/preview state
              // that must not update an unmounted screen.
              if (goneRef.current) return;
              // Smart-naming is fired (fire-and-forget) at project creation and
              // usually lands during this first build. Pull the freshest name so
              // the header shows the smart name instead of the raw-prompt slice.
              supabase
                .from('projects')
                .select('name')
                .eq('id', id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data?.name && !goneRef.current) setName(data.name);
                });
              setMessages((m) =>
                m.map((x) =>
                  x.id === aId && x.role === 'assistant'
                    ? { ...x, text: chatText || t('done'), streaming: false }
                    : x,
                ),
              );
              // Lovable-parity persistence: the assistant turn goes to chat
              // history, and the new file state becomes a restorable version.
              // Both best-effort — the build already succeeded.
              saveMessage(id, 'assistant', chatText || t('done'), { filesChanged: changed, clientId: aId });
              saveVersion(id, next, userMsg.text);
              // The reveal: auto-render the freshly built app in the slide-up
              // sheet. Fire-and-forget — only runs when files actually changed.
              if (changed.length > 0) {
                autoPreview(next); // instant preview with labeled gradient placeholders
                // Then resolve real AI images in the background, persist them, and
                // refresh the preview so it "comes to life". Best-effort; the
                // gradient-labeled preview already shown never regresses on failure.
                resolveImages(id, next)
                  .then(({ files: withImages, changed: imgChanged }) => {
                    if (!imgChanged || goneRef.current) return;
                    // Merge only the paths resolveImages actually touched (vs. the
                    // `next` snapshot it was given) onto whatever `files` is NOW —
                    // not a blind replace. Otherwise a manual regenerate from the
                    // Images panel, made while this background resolve was still
                    // in flight, gets silently overwritten by this stale snapshot.
                    const touched = Object.keys(withImages).filter(
                      (path) => withImages[path]?.content !== next[path]?.content,
                    );
                    const merged = { ...filesRef.current };
                    for (const path of touched) merged[path] = withImages[path];
                    setFiles(merged);
                    saveFiles(id, merged).catch(() => {});
                    autoPreview(merged);
                  })
                  .catch(() => {});
                maybePromptReview();
                // "What's next" chips — best-effort, never blocks the build from
                // reading as done even if the suggestions call fails or is slow.
                fetchSuggestions()
                  .then(({ suggestions }) => {
                    if (goneRef.current || suggestions.length === 0) return;
                    setMessages((m) => [...m, { id: `sg${Date.now()}`, role: 'suggestions', items: suggestions }]);
                  })
                  .catch(() => {});
              }
            } catch (e) {
              if (!goneRef.current) {
                setMessages((m) =>
                  m.map((x) =>
                    x.id === aId && x.role === 'assistant'
                      ? { ...x, text: `Saved on server, but: ${(e as Error).message}`, streaming: false }
                      : x,
                  ),
                );
              }
            } finally {
              runningRef.current = false;
              if (!goneRef.current) {
                setBusy(false);
                refreshCredits();
              }
            }
          },
          onError: (msg) => {
            if (goneRef.current) return;
            warn();
            // Turn the raw "Build failed (402): Not enough credits…" into a calm
            // nudge to top up on the web (where credits are bought via Dodo).
            const outOfCredits = /\b402\b|not enough credits|insufficient/i.test(msg);
            const shown = outOfCredits ? t('outOfCreditsBody') : msg;
            setMessages((m) =>
              m.map((x) =>
                x.id === aId && x.role === 'assistant' ? { ...x, text: shown, streaming: false } : x,
              ),
            );
            if (outOfCredits) {
              Alert.alert(t('outOfCredits'), t('buyMoreCredits'), [
                { text: t('notNow'), style: 'cancel' },
                { text: t('buyCredits'), onPress: () => router.push('/paywall') },
              ]);
            }
            runningRef.current = false;
            setBusy(false);
            refreshCredits();
          },
        },
      );
    },
    [id, user?.id, busy, type, files, messages, refreshCredits, autoPreview, router, t, clearPendingImage],
  );

  const onPickSuggestion = useCallback((s: Suggestion) => {
    setInput(s.prompt);
    inputRef.current?.focus();
  }, []);

  // Cancel an in-flight build — abort the stream, unlock the UI, and close out
  // the streaming bubble. Guarantees recovery even if the network never replies.
  const cancel = useCallback(() => {
    handleRef.current?.abort();
    handleRef.current = null;
    runningRef.current = false;
    setBusy(false);
    setMessages((m) =>
      m.map((x) =>
        x.role === 'assistant' && x.streaming
          ? { ...x, streaming: false, text: x.text || t('buildCancelled') }
          : x,
      ),
    );
  }, [t]);

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
      Alert.alert(t('couldntPlan'), (e as Error).message, [{ text: t('ok') }]);
    }
  }, [type, refreshCredits, t]);

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

  const doExportZip = useCallback(async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      const path = await exportProjectZip(id, name);
      if (goneRef.current) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/zip', dialogTitle: name || 'Export project' });
      } else if (!goneRef.current) {
        showToast('Exported, but sharing is not available on this device', 'error');
      }
    } catch (e) {
      if (!goneRef.current) Alert.alert('Export failed', (e as Error).message);
    } finally {
      if (!goneRef.current) setExporting(false);
    }
  }, [id, name, exporting, showToast]);

  const doGithubPush = useCallback(async () => {
    if (!id || pushingGithub) return;
    setPushingGithub(true);
    try {
      const status = await getGithubRepoStatus(id);
      if (goneRef.current) return;
      if (!status.connected) {
        Alert.alert(
          'GitHub not connected',
          'Connect GitHub for this account from the web editor first (Account → GitHub), then push from here.',
        );
        return;
      }
      if (!status.repo) {
        Alert.alert(
          'No repo linked',
          'This project isn’t linked to a GitHub repo yet — create one from the web editor first.',
        );
        return;
      }
      await pushToGithub(id, files);
      if (!goneRef.current) showToast(`Pushed to ${status.repo}`, 'success');
    } catch (e) {
      if (!goneRef.current) Alert.alert('Push failed', (e as Error).message);
    } finally {
      if (!goneRef.current) setPushingGithub(false);
    }
  }, [id, files, pushingGithub, showToast]);

  const hasFiles = Object.keys(files).length > 0;
  // Only a TRAILING @mention triggers the picker (typing at the end of the
  // input) — covers the common case without the complexity of tracking
  // cursor position through RN's TextInput selection events.
  const mentionMatch = input.match(/@([\w./-]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const onPickMention = useCallback(
    (path: string) => {
      // Function replacer, not a template-string replacement — a path
      // containing "$" (e.g. a Remix-style $id.tsx route in the generated
      // project) would otherwise be parsed as a special replacement pattern
      // ($&, $$, etc.) by String.replace and corrupt the inserted text.
      setInput((prev) => prev.replace(/@([\w./-]*)$/, () => `@${path} `));
      inputRef.current?.focus();
    },
    [],
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: name || t('builder'),
          headerRight: () => (
            <View style={styles.headerRow}>
              {credits !== null ? (
                <Pressable onPress={() => router.push('/account')} hitSlop={8} style={styles.creditsChip}>
                  <Ionicons name="flash" size={12} color={brand.accent} />
                  <Text style={styles.creditsText}>{credits.toLocaleString()}</Text>
                </Pressable>
              ) : null}
              {hasFiles ? (
                <Pressable onPress={() => setToolsOpen(true)} hitSlop={8}>
                  <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color={brand.textMuted} />
                </Pressable>
              ) : null}
              {hasFiles ? (
                <Pressable onPress={() => router.push(`/preview/${id}`)} hitSlop={8} style={styles.previewBtn}>
                  <Ionicons name="play" size={14} color={brand.onAccent} />
                  <Text style={styles.previewBtnText}>{t('preview')}</Text>
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
              <Text style={styles.emptyTitle}>{t('describeWhatToBuild')}</Text>
              <Text style={styles.emptyBody}>
                {t('emptyExample').replace('{target}', type === 'mobile' ? t('aMobileApp') : t('aWebApp'))}
              </Text>
            </View>
          }
          renderItem={({ item }) => <MessageBubble msg={item} onPickSuggestion={onPickSuggestion} />}
        />
      )}

      {planState === 'none' && autoFixError && !busy ? (
        <View style={styles.autoFixBanner}>
          <Ionicons name="warning-outline" size={16} color={brand.warning} />
          <Text style={styles.autoFixText} numberOfLines={2}>
            Preview error — AutoFix?
          </Text>
          <Pressable
            onPress={() => {
              const err = autoFixError;
              setAutoFixError(null);
              run(autoFixPrompt(err), undefined, { consumeImage: false });
            }}
            style={styles.autoFixConfirm}
          >
            <Text style={styles.autoFixConfirmText}>Fix it</Text>
          </Pressable>
          <Pressable onPress={() => setAutoFixError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={brand.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {planState === 'none' && mentionQuery !== null ? (
        <FileMentionPicker query={mentionQuery} files={Object.keys(files)} onPick={onPickMention} />
      ) : null}

      {planState === 'none' && pendingImagePreview ? (
        <View style={styles.pendingImageRow}>
          <Image source={{ uri: pendingImagePreview }} style={styles.pendingImageThumb} contentFit="cover" />
          <Text style={styles.pendingImageText}>Photo attached</Text>
          <Pressable onPress={clearPendingImage} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={brand.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {planState === 'none' && (
      <View style={styles.inputBar}>
        <Pressable onPress={pickImage} disabled={busy} hitSlop={8} style={styles.cameraBtn}>
          <Ionicons name="camera-outline" size={22} color={busy ? brand.textFaint : brand.textMuted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={hasFiles ? t('describeChange') : t('describeApp')}
          placeholderTextColor={brand.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          editable={!busy}
        />
        <MicButton value={input} onChangeText={setInput} disabled={busy} size={40} />
        <Pressable
          onPress={busy ? cancel : () => run(input)}
          disabled={!busy && !input.trim()}
          accessibilityLabel={busy ? t('cancelBuild') : t('send')}
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

      <BottomSheet
        visible={toolsOpen}
        title={t('projectTools')}
        subtitle={name || undefined}
        onClose={() => setToolsOpen(false)}
        actions={[
          {
            icon: 'extension-puzzle-outline',
            label: t('connectors'),
            description: t('connectorsDesc'),
            onPress: () => setConnectorsOpen(true),
          },
          {
            icon: 'color-palette-outline',
            label: t('themes'),
            description: t('themesDesc'),
            onPress: () => router.push(`/themes/${id}`),
          },
          {
            icon: 'time-outline',
            label: t('versionHistory'),
            description: t('versionHistoryDesc'),
            onPress: () => router.push(`/versions/${id}`),
          },
          {
            icon: 'code-slash-outline',
            label: t('viewCode'),
            description: t('viewCodeDesc'),
            onPress: () => router.push(`/code/${id}`),
          },
          {
            icon: 'image-outline',
            label: 'Images',
            description: 'Regenerate or upgrade generated images',
            onPress: () => setImagesOpen(true),
          },
          {
            icon: 'library-outline',
            label: 'Knowledge',
            description: 'Context the AI always reads for this project',
            onPress: () => setKnowledgeOpen(true),
          },
          {
            icon: 'download-outline',
            label: exporting ? 'Exporting…' : 'Export ZIP',
            description: 'Download the full source, no WyberAi dependency',
            onPress: doExportZip,
          },
          {
            icon: 'logo-github',
            label: pushingGithub ? 'Pushing…' : 'Push to GitHub',
            description: 'Push the latest files to the linked repo',
            onPress: doGithubPush,
          },
        ]}
      />

      <SafeWidget>
        <PreviewRevealSheet
          state={reveal}
          onClose={() => setReveal({ phase: 'hidden' })}
          onOpenFull={() => {
            setReveal({ phase: 'hidden' });
            setTimeout(() => router.push(`/preview/${id}`), 10);
          }}
          onRuntimeError={(info) => setAutoFixError(info)}
        />
      </SafeWidget>

      <ConnectorsSheet
        visible={connectorsOpen}
        onClose={() => setConnectorsOpen(false)}
        onRun={(prompt) => run(prompt, undefined, { consumeImage: false })}
      />

      <ImagesPanelSheet
        visible={imagesOpen}
        onClose={() => setImagesOpen(false)}
        projectId={id}
        files={files}
        onFilesChange={(next) => {
          setFiles(next);
          if (id) saveFiles(id, next).catch(() => {});
          autoPreview(next);
        }}
        onCreditsChange={() => refreshCredits()}
      />

      <KnowledgeSheet visible={knowledgeOpen} onClose={() => setKnowledgeOpen(false)} projectId={id} />
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
  const t = useT(BUILD_SCREEN_STRINGS);

  if (state === 'planning') {
    return (
      <View style={ps.center}>
        <ActivityIndicator color={brand.accent} />
        <Text style={ps.planningText}>{t('thinkingPlan')}</Text>
      </View>
    );
  }

  if (state === 'offer') {
    return (
      <View style={ps.center}>
        <Ionicons name="map-outline" size={40} color={brand.accent} />
        <Text style={ps.title}>{t('planItFirst')}</Text>
        <Text style={ps.body}>
          {t('planItFirstBody').replace('{target}', type === 'mobile' ? t('aMobileApp') : t('aWebApp'))}
        </Text>
        <Pressable style={ps.primary} onPress={onSeePlan}>
          <Ionicons name="sparkles" size={16} color={brand.onAccent} />
          <Text style={ps.primaryText}>{t('showMePlan')}</Text>
        </Pressable>
        <Pressable style={ps.ghost} onPress={onJustBuild}>
          <Text style={ps.ghostText}>{t('justBuildIt')}</Text>
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

      <Text style={ps.sectionLabel}>{t('features')}</Text>
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
        <Text style={ps.primaryText}>{t('buildThis')}</Text>
      </Pressable>
      <Pressable style={ps.ghost} onPress={onJustBuild}>
        <Text style={ps.ghostText}>{t('skipBuildFromPrompt')}</Text>
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

function MessageBubble({ msg, onPickSuggestion }: { msg: Msg; onPickSuggestion: (s: Suggestion) => void }) {
  if (msg.role === 'user') {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.role === 'suggestions') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
        {msg.items.map((s, i) => (
          <Pressable key={i} style={styles.suggestionChip} onPress={() => onPickSuggestion(s)}>
            <Text style={styles.suggestionText} numberOfLines={1}>{s.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }
  const progress = msg.progress ?? [];
  // The plain checklist stays as the SafeWidget fallback: if the animated
  // theater ever crashes, the build keeps its original progress rendering.
  const plainChecklist = (
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
  );
  return (
    <View style={[styles.bubble, styles.aiBubble]}>
      {msg.agentLanes && msg.agentLanes.length > 0 ? (
        <SafeWidget>
          <AgentFeed lanes={msg.agentLanes} />
        </SafeWidget>
      ) : null}
      {progress.length > 0 && msg.streaming ? (
        <SafeWidget fallback={plainChecklist}>
          <BuildTheater progress={progress} />
        </SafeWidget>
      ) : null}
      {msg.text ? (
        msg.streaming ? (
          <StreamingText text={msg.text} style={styles.aiText} />
        ) : (
          <Text style={styles.aiText}>{msg.text}</Text>
        )
      ) : null}
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
  suggestionsRow: { gap: space.sm, paddingVertical: 2 },
  suggestionChip: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxWidth: 220,
  },
  suggestionText: { color: brand.accent, fontSize: 13, fontWeight: '600' },
  autoFixBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,158,11,0.25)',
  },
  autoFixText: { flex: 1, color: brand.warning, fontSize: 13, fontWeight: '600' },
  autoFixConfirm: {
    backgroundColor: brand.warning,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
  },
  autoFixConfirmText: { color: '#1a1206', fontSize: 12.5, fontWeight: '700' },
  cameraBtn: { padding: space.xs, marginBottom: 2 },
  pendingImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: brand.surface,
  },
  pendingImageThumb: { width: 32, height: 32, borderRadius: radius.sm },
  pendingImageText: { flex: 1, color: brand.textMuted, fontSize: 12.5 },
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
