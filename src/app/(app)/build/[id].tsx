import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
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
  streamAssist,
  fetchPlanManifest,
  toFileContext,
  exportProjectZip,
  getGithubRepoStatus,
  pushToGithub,
  publishProject,
  listSecretNames,
  saveSecret,
  type FileMap,
  type Plan,
  type ProjectType,
  type Suggestion,
} from '@/lib/api';
import { buildStagedPlan, forgeLine, pickRouterFile, type PlannedFile } from '@/lib/staged-plan';
import { classifyIntent } from '@/lib/intent';
import { windowedHistory } from '@/lib/chat-history-window';
import { detectDeps, detectRegulated, type RegulatedDomain } from '@/lib/detect-deps';
import { MODEL_META, creditCost, tierAllowedForPlan, type ModelTier } from '@/lib/credits';
import * as Sharing from 'expo-sharing';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImagesPanelSheet } from '@/components/ImagesPanelSheet';
import { KnowledgeSheet } from '@/components/KnowledgeSheet';
import { useToast } from '@/components/Toast';
import { thunk, warn, tap } from '@/lib/haptics';
import { cleanStreamingDisplay, extractProgressLines } from '@/lib/file-parser';
import { extractAgentEvents, deriveAgentLanes, type AgentEvent, type AgentLane } from '@/lib/agents/events';
import { AGENT_TEAM_ENABLED } from '@/lib/agents/roster';
import { BottomSheet } from '@/components/BottomSheet';
import { BuildTheater } from '@/components/BuildTheater';
import { AgentFeed } from '@/components/AgentFeed';
import { ConnectorsSheet } from '@/components/ConnectorsSheet';
import { MicButton } from '@/components/MicButton';
import {
  PreviewRevealSheet,
  type RevealState,
  type RuntimeErrorInfo,
  type SelectedElementInfo,
  type PreviewBridgeHandle,
} from '@/components/PreviewRevealSheet';
import { VisualEditSheet } from '@/components/VisualEditSheet';
import { injectWyberLoc } from '@/lib/wyber-preview-loc';
import { injectMobileBridge } from '@/lib/wyber-preview-mobile-bridge';
import { applyTextEdit, applyClassEdit, stepClass, setColorClass, type StepFamily } from '@/lib/visual-edit-apply';
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

// Contextual "what's next" chips shown after a successful build. Unlike the
// AI-personalized "today's ideas" (Home screen, /api/suggestions — unrelated
// NEW app ideas), these are fixed follow-ups for iterating on the app just
// built, so finishing a daily tracker doesn't surface "fitness dashboard."
const NEXT_STEP_SUGGESTIONS: Suggestion[] = [
  { title: 'Make it look better', prompt: 'Improve the visual design — spacing, colors, and typography', category: 'design' },
  { title: 'Add a feature', prompt: 'Suggest and add one new feature that would make this app more useful', category: 'productivity' },
  { title: 'Polish the details', prompt: 'Polish the rough edges — fix alignment, spacing, and any inconsistencies', category: 'design' },
  { title: 'Make it responsive', prompt: 'Make sure this looks great on every screen size', category: 'productivity' },
];

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
  const { user, credits, plan: userPlan, refreshCredits } = useSession();

  // Model choice: Sonnet (fast) shown by default, but until the user actually
  // taps another one (tierTouched), nothing explicit is sent — the server's
  // own complexity-aware auto-routing decides. Same picker web's ChatPanel
  // has (Opus/Fable one tap away, disabled — not hidden — if the current
  // plan doesn't reach them). See lib/credits.ts.
  const PICKABLE_TIERS: ModelTier[] = ['fast', 'default', 'fable'];
  const [modelTier, setModelTier] = useState<ModelTier>('fast');
  const [tierTouched, setTierTouched] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('web');
  const [files, setFiles] = useState<FileMap>({});
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // The conversational lane (see lib/intent.ts) — questions/confirmations get
  // a free reply through here instead of a paid build. Separate from `busy`
  // (the build lane's spinner) since a chat reply is short and doesn't touch
  // files, credits, or the build-cancel machinery.
  const [chatBusy, setChatBusy] = useState(false);
  // Pre-gen dependency gate (see lib/detect-deps.ts) — a NEW build whose
  // prompt implies it needs Supabase/Stripe/a Composio tool gets blocked
  // here, before any credits are spent, until the user provides those keys
  // or explicitly chooses to build without them (likely-broken payment/auth
  // code is a worse outcome than one extra tap).
  const [pendingGenArgs, setPendingGenArgs] = useState<{
    prompt: string;
    needsSupabase: boolean;
    needsStripe: boolean;
    composioTools: string[];
  } | null>(null);
  const [inlineSecrets, setInlineSecrets] = useState<Record<string, string>>({});
  const [secretSaving, setSecretSaving] = useState(false);
  // Non-blocking compliance notice for health/financial/government-ID
  // prompts — never gates the build, just names the real requirement
  // (HIPAA, PCI-DSS, etc.) so the user isn't surprised later.
  const [pendingRegulated, setPendingRegulated] = useState<{ prompt: string; domains: RegulatedDomain[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
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
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({ base64: false, quality: 1, allowsEditing: false });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;
      await processPickedAsset(asset);
    } catch (e) {
      // launchCameraAsync is documented to throw (not resolve) when the
      // camera hardware is busy or unavailable — an unguarded native call
      // otherwise fails as a silent unhandled rejection with no user-facing
      // message, one of the most common real-world RN crash categories.
      Alert.alert('Could not open camera', (e as Error).message || 'Try again in a moment.');
    }
  }, [processPickedAsset]);

  const pickFromLibrary = useCallback(async () => {
    try {
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
    } catch (e) {
      Alert.alert('Could not open photo library', (e as Error).message || 'Try again in a moment.');
    }
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

  // Staged document attachment (text/PDF) — same ref+state pattern as the
  // photo attach above. .xlsx/.xls are deliberately NOT supported here: web
  // parses those with a JS spreadsheet library (xlsx/SheetJS); adding that as
  // a new dependency without a way to verify a live Metro/EAS build in this
  // environment is a real risk this pass doesn't take — text files and PDFs
  // need nothing extra (PDFs go to Claude as a native document content
  // block, no client-side extraction; text files are just read as UTF-8).
  type PendingDoc = { name: string; kind: 'text' | 'pdf'; content?: string; base64?: string };
  const pendingDocsRef = useRef<PendingDoc[]>([]);
  const [pendingDocNames, setPendingDocNames] = useState<string[]>([]);

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/*', 'text/csv', 'text/markdown', 'application/json'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isPdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name);
    try {
      const FileSystem = await import('expo-file-system/legacy');
      if (isPdf) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        pendingDocsRef.current = [...pendingDocsRef.current, { name: asset.name, kind: 'pdf', base64 }];
      } else {
        const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        pendingDocsRef.current = [...pendingDocsRef.current, { name: asset.name, kind: 'text', content: raw.slice(0, 20000) }];
      }
      setPendingDocNames(pendingDocsRef.current.map((d) => d.name));
    } catch (e) {
      Alert.alert('Couldn\'t read that file', (e as Error).message || 'Try a different file.');
    }
  }, []);

  const removePendingDoc = useCallback((name: string) => {
    pendingDocsRef.current = pendingDocsRef.current.filter((d) => d.name !== name);
    setPendingDocNames(pendingDocsRef.current.map((d) => d.name));
  }, []);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const showToast = useToast();
  // The reveal moment: after a build lands, the app auto-renders in a slide-up
  // sheet. Purely additive — every await mutates only this state, and the
  // whole surface is SafeWidget'd, so a preview failure can't touch chat.
  const [reveal, setReveal] = useState<RevealState>({ phase: 'hidden' });
  useEffect(() => {
    if (reveal.phase === 'ready' || reveal.phase === 'ready-html') lastGoodRevealRef.current = reveal;
  }, [reveal]);
  // Surfaced by the reveal sheet's WebView error bridge — powers the AutoFix
  // banner offering to send the error straight back into the chat as a repair
  // prompt. Cleared whenever a new build starts (run()) or the preview
  // silently re-renders (autoPreview()) since either makes the previous error stale.
  const [autoFixError, setAutoFixError] = useState<RuntimeErrorInfo | null>(null);
  // Self-heal: web silently auto-retries a broken preview up to MAX_HEAL times
  // per turn, free, with no tap required — mobile used to require the user to
  // notice the banner and tap "Fix it" themselves. Budget is a TOTAL per
  // user-initiated turn (reset in run(), NOT on the autofix retry itself —
  // see the isAutoFix opt below), never reset by an autofix rewrite, so a
  // build that autofix genuinely can't resolve stops instead of looping.
  const MAX_HEAL = 3;
  const healCountRef = useRef(0);
  const [healFailed, setHealFailed] = useState(false);
  // The last preview that actually rendered — if self-heal gives up, revert
  // to this instead of leaving the user staring at a broken app. A broken
  // edit must never blank out a previously working build.
  const lastGoodRevealRef = useRef<RevealState | null>(null);
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
      // A REBUILD must never blank an already-working preview behind a
      // spinner, or force open a sheet the user closed — this used to
      // unconditionally setReveal({phase:'building'}) on every single call,
      // reproducing the exact regression web's PreviewPanel.tsx explicitly
      // guards against (its own comment: a real user "saw FOUR simultaneous
      // building indicators and rightly called it out"). 'building' (the
      // only full-screen takeover, and the only phase that shows the
      // build-time filler game) is now reserved for when there's truly
      // nothing to preserve yet.
      setReveal((prev) => {
        if (prev.phase === 'ready' || prev.phase === 'ready-html') return { ...prev, refreshing: true };
        if (prev.phase === 'hidden' && lastGoodRevealRef.current) return prev; // stay closed, update silently below
        return { phase: 'building' };
      });
      try {
        if (type === 'mobile') {
          const html = await buildMobilePreviewHtml(id, nextFiles);
          if (!goneRef.current) {
            const next: RevealState = { phase: 'ready-html', html };
            lastGoodRevealRef.current = next; // set directly — the reveal-watcher effect won't fire if `reveal` itself stays 'hidden'
            setReveal((prev) => (prev.phase === 'hidden' ? prev : next));
          }
        } else {
          // Visual Edits (tap-to-select 0-credit editing) needs the preview's
          // DOM tagged with source locations and carrying the selection
          // bridge — a transient transform of a FILES COPY only, never
          // persisted to the project. Doesn't apply to React Native projects
          // (data-wyber-loc only tags lowercase HTML tags).
          const previewFiles = injectMobileBridge(injectWyberLoc(nextFiles));
          const url = await buildPreview(id, previewFiles);
          if (!goneRef.current) {
            const next: RevealState = { phase: 'ready', url };
            lastGoodRevealRef.current = next;
            setReveal((prev) => (prev.phase === 'hidden' ? prev : next));
          }
        }
        if (!goneRef.current) thunk();
      } catch {
        // Same principle on failure: a hidden sheet stays hidden (the last
        // good content, if any, is untouched and still what reopening would
        // show) rather than popping open to an error card the user never
        // asked to see mid-edit.
        if (!goneRef.current) setReveal((prev) => (prev.phase === 'hidden' ? prev : { phase: 'error' }));
      }
    },
    [id, type, name],
  );

  const loadProject = useCallback(() => {
    if (!id) return;
    setLoadError(false);
    // Project meta/files and chat history load in parallel; the screen unlocks
    // when the project arrives (history fills in whenever it lands — usually
    // together, and an empty/failed history read must never block building).
    // Supabase's query builder is only a PromiseLike (thenable), not a real
    // Promise — its .then() return type doesn't guarantee .catch(), so wrap
    // it in Promise.resolve() first to chain one safely.
    Promise.resolve(
      supabase.from('projects').select('id,name,project_type,files').eq('id', id).maybeSingle(),
    )
      .then(({ data, error }) => {
        if (goneRef.current) return;
        if (error) {
          // This is the single most-used screen in the app — a missing
          // .catch() here left it stuck on the loading spinner forever on
          // any network blip, with no way back short of leaving and
          // re-entering. Surface a real retry instead.
          setLoadError(true);
          return;
        }
        if (data) {
          setName(data.name ?? '');
          setType((data.project_type as ProjectType) ?? 'web');
          setFiles((data.files as FileMap) ?? {});
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!goneRef.current) setLoadError(true);
      });
  }, [id]);

  useEffect(() => {
    loadProject();
    if (!id) return;
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
  // In-session Undo — an instant, free, in-memory snapshot stack (last 20),
  // separate from the heavier Version History screen (server round trip,
  // confirm dialog, navigating away). Snapshotted right before each EDIT
  // turn (never a first build — there's nothing meaningful to undo to
  // before any files exist), same timing as web's pushCheckpoint.
  const checkpointsRef = useRef<{ files: FileMap; label: string }[]>([]);
  const [hasCheckpoint, setHasCheckpoint] = useState(false);
  // Visual Edits — tap-to-select 0-credit direct editing. web/website/saas
  // projects only (data-wyber-loc only tags lowercase HTML JSX tags; a React
  // Native project's <View>/<Text> never match). selectMode toggles the
  // injected preview bridge's tap-to-select; selectedEl is the last tapped
  // element, driving the edit sheet.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedElementInfo | null>(null);
  const previewBridgeRef = useRef<PreviewBridgeHandle | null>(null);
  // Same reasoning as runningRef above, for the free chat lane — chatBusy is
  // React state (async commit), so a fast double-tap while a message
  // classifies as CHAT could otherwise fire two concurrent /api/assist
  // requests and persist the user's message twice before either request's
  // state commits.
  const chatRunningRef = useRef(false);
  // Long builds stream over a single connection with no reconnect logic —
  // backgrounding mid-build (switching to another app) can silently drop it,
  // which then surfaces as a bare "Network error." Tracking this lets the
  // error handler give an honest, specific reason instead of a generic one.
  const backgroundedDuringRunRef = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && runningRef.current) backgroundedDuringRunRef.current = true;
    });
    return () => sub.remove();
  }, []);
  // A staged build fires several concurrent/sequential requests per turn —
  // handleRef alone (one abort target) isn't enough. cancel() aborts
  // everything currently in this array; cancelledRef stops the orchestration
  // from dispatching further stages or applying a stage that lands after
  // the user already cancelled.
  const activeHandlesRef = useRef<{ abort: () => void }[]>([]);
  const cancelledRef = useRef(false);
  // Per-invocation generation counter — see runStagedBuild's isCurrentGen()
  // for why a single cancelledRef boolean isn't enough: it can't distinguish
  // "this generation was cancelled" from "a new generation started" (run()
  // resets cancelledRef unconditionally), which let a stale response from a
  // cancelled build splice into a build started right after it. Every run()
  // call bumps this and captures its own value; cancel() also bumps it,
  // which invalidates whatever generation was active without needing to
  // know its specific number.
  const buildGenRef = useRef(0);

  // First build (no files yet), no image attached, agent-team on → stage the
  // build (Atlas plans → Forge scaffolds the shell → fills the rest in
  // concurrent free batches → wires the real screens in), instead of one
  // single request. Mirrors the web app's ChatPanel runAgenticBuild, gated
  // the same way there is here: STAGE_THRESHOLD (4+ planned files) decides
  // whether a build is even worth staging; smaller ones fall through to the
  // same one-shot 'full' request this always used to send. The plan pass
  // can't see an attached photo, so an image-attached build always takes the
  // one-shot path too — same rule the web app follows.
  const runStagedBuild = useCallback(async (prompt: string, aId: string, history: { role: string; content: string }[], userMsgText: string, myGen: number) => {
    handleRef.current = { abort: () => activeHandlesRef.current.forEach((h) => h.abort()) };
    // A staged build has several sleeps between checks and the next network
    // fire (backoff before a retry, stagger before a fill batch). Checking
    // ONLY before the sleep leaves a window where cancel() lands during the
    // wait and the code fires the request anyway — and a single shared
    // `cancelledRef` boolean can't tell "this generation was cancelled" apart
    // from "a NEW generation started" (run() resets it unconditionally), so a
    // stale response from a cancelled build could splice into a build
    // started right after it. myGen is this call's own generation number
    // (buildGenRef.current at the moment run() dispatched it); isCurrentGen()
    // is re-checked immediately before every fireStage call, not just before
    // the preceding sleep, and stays correct across cancel-then-restart.
    const isCurrentGen = () => buildGenRef.current === myGen;
    const isStale = () => goneRef.current || !isCurrentGen();
    // One id for every request in this build's chain (scaffold + every fill
    // batch + wire) — lets the server sum real usage across the WHOLE build
    // for its overage safety valve (see computeOverageCharge in the web
    // repo's lib/credits.ts) instead of only whichever single request
    // happens to carry finalPass. Threaded through fireStage's base params
    // below so every stage call gets it automatically.
    const buildId = `b${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const completedEvents: AgentEvent[] = [];
    const completedProgress: string[] = [];
    let passCount = 0;
    const MAX_INTERNAL_PASSES = 8;

    const paintBubble = (liveFull: string, liveText?: string) => {
      if (isStale()) return;
      const liveEvents = AGENT_TEAM_ENABLED ? extractAgentEvents(liveFull) : [];
      const liveProgress = extractProgressLines(liveFull);
      setMessages((m) =>
        m.map((x) =>
          x.id === aId && x.role === 'assistant'
            ? {
                ...x,
                text: liveText ?? x.text,
                progress: [...completedProgress, ...liveProgress],
                agentLanes: AGENT_TEAM_ENABLED ? deriveAgentLanes([...completedEvents, ...liveEvents]) : undefined,
              }
            : x,
        ),
      );
    };

    const fireStage = (
      stageOpts: {
        stage?: 'scaffold' | 'fill' | 'wire';
        stageFiles?: string[];
        stagePurposes?: string[];
        internalPass?: boolean;
        finalPass?: boolean;
        buildComplexity?: 'HIGH' | 'LOW';
        totalPlannedFiles?: number;
      },
      showText = false,
    ): Promise<{ ok: boolean; changed: string[]; chatText: string }> =>
      new Promise((resolve) => {
        const h = streamGenerate(
          { prompt, projectId: id!, userId: user!.id, projectType: type, files: filesRef.current, history, modelTier: tierTouched ? modelTier : undefined, buildId, ...stageOpts },
          {
            onText: (full) => paintBubble(full, showText ? cleanStreamingDisplay(full) : undefined),
            onDone: (full) => {
              try {
                const { files: next, chatText, changed } = applyGeneration(filesRef.current, full);
                // The critical guard: a response for a cancelled/superseded
                // generation must never write into files a newer generation
                // now owns.
                if (changed.length > 0 && !isStale()) {
                  filesRef.current = next;
                  setFiles(next);
                }
                completedEvents.push(...(AGENT_TEAM_ENABLED ? extractAgentEvents(full) : []));
                completedProgress.push(...extractProgressLines(full));
                resolve({ ok: true, changed, chatText });
              } catch (e) {
                resolve({ ok: false, changed: [], chatText: (e as Error).message });
              }
            },
            onError: (msg) => resolve({ ok: false, changed: [], chatText: msg }),
          },
        );
        activeHandlesRef.current.push(h);
      });

    const finishTurn = async (chatText: string) => {
      if (isStale()) return;
      const finalFiles = filesRef.current;
      if (Object.keys(finalFiles).length === 0) {
        setMessages((m) =>
          m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: chatText || t('thatDidntWork'), streaming: false } : x)),
        );
        return;
      }
      supabase.from('projects').select('name').eq('id', id).maybeSingle().then(({ data }) => {
        if (data?.name && !goneRef.current) setName(data.name);
      });
      setMessages((m) =>
        m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: chatText || t('done'), streaming: false } : x)),
      );
      saveMessage(id!, 'assistant', chatText || t('done'), { filesChanged: Object.keys(finalFiles), clientId: aId });
      saveVersion(id!, finalFiles, userMsgText);
      autoPreview(finalFiles);
      resolveImages(id!, finalFiles)
        .then(({ files: withImages, changed: imgChanged }) => {
          if (!imgChanged || goneRef.current) return;
          const touched = Object.keys(withImages).filter((path) => withImages[path]?.content !== finalFiles[path]?.content);
          const merged = { ...filesRef.current };
          for (const path of touched) merged[path] = withImages[path];
          filesRef.current = merged;
          setFiles(merged);
          saveFiles(id!, merged).catch(() => {});
          autoPreview(merged);
        })
        .catch(() => {});
      maybePromptReview();
      setMessages((m) => [...m, { id: `sg${Date.now()}`, role: 'suggestions', items: NEXT_STEP_SUGGESTIONS }]);
    };

    try {
      // Atlas: free plan pass — a JSON file manifest. One retry before
      // falling back to the one-shot build (transient API blips are common
      // enough on a single shot that giving up on staging entirely after one
      // miss would needlessly lose the reliable path).
      let manifestResult = await fetchPlanManifest(prompt, type, user!.id, id!);
      if (!manifestResult.files.length) manifestResult = await fetchPlanManifest(prompt, type, user!.id, id!);
      const staged = manifestResult.files.length ? buildStagedPlan(manifestResult.files) : null;
      const buildComplexity = manifestResult.buildComplexity;

      if (isStale()) return;

      if (!staged || !staged.shouldStage) {
        const result = await fireStage({}, true);
        if (isStale()) return;
        if (!result.ok) {
          const msg = result.chatText || 'Network error during build';
          const outOfCredits = /\b402\b|not enough credits|insufficient/i.test(msg);
          const droppedInBackground = backgroundedDuringRunRef.current && /network|timeout/i.test(msg);
          if (outOfCredits) {
            setInput('');
            Alert.alert(t('outOfCredits'), t('buyMoreCredits'), [
              { text: t('notNow'), style: 'cancel' },
              { text: t('buyCredits'), onPress: () => router.push('/paywall') },
            ]);
            throw new Error(t('outOfCreditsBody'));
          }
          if (droppedInBackground) setInput(prompt);
          throw new Error(droppedInBackground ? 'Build interrupted — switching apps dropped the connection. Your prompt is back in the box, ready to send again.' : msg);
        }
        await finishTurn(result.chatText);
        return;
      }

      passCount = 1;
      const hasFills = staged.fillBatches.length > 0;
      completedProgress.push(forgeLine([], 'scaffold'));
      paintBubble('');
      const scaffold = await fireStage({
        stage: 'scaffold',
        stageFiles: staged.scaffoldPaths,
        stagePurposes: staged.scaffoldPaths.map(() => ''),
        finalPass: !hasFills,
        totalPlannedFiles: staged.files.length,
        buildComplexity,
      });
      if (isStale()) return;
      if (!scaffold.ok || Object.keys(filesRef.current).length === 0) {
        throw new Error(scaffold.chatText || 'Build failed at the shell stage.');
      }
      // The shell renders right away — same intent as web's "the one charged
      // pass" comment: don't wait for fills to show the user something.
      autoPreview(filesRef.current);

      const routerPath = pickRouterFile(staged.scaffoldPaths);
      const willWire = !!routerPath;
      const unresolvedFiles: PlannedFile[] = [];

      const runFillBatch = async (batch: PlannedFile[], i: number, isLast: boolean) => {
        await new Promise((r) => setTimeout(r, i * 150));
        if (isStale()) return { hardFailed: false, missing: [] as PlannedFile[] };
        passCount += 1;
        completedProgress.push(forgeLine(batch, 'fill'));
        paintBubble('');
        const batchPaths = batch.map((f) => f.path);
        const batchPurposes = batch.map((f) => f.purpose);
        let res = await fireStage({
          stage: 'fill', stageFiles: batchPaths, stagePurposes: batchPurposes,
          internalPass: true, finalPass: !willWire && isLast, buildComplexity,
        });
        if (!res.ok && !isStale()) {
          await new Promise((r) => setTimeout(r, 1200));
          // Re-checked HERE, not just before the sleep — a cancel (or a new
          // build superseding this one) landing during the 1.2s backoff must
          // not fire a stray paid request once the wait is over.
          if (isStale()) return { hardFailed: false, missing: [] as PlannedFile[] };
          res = await fireStage({
            stage: 'fill', stageFiles: batchPaths, stagePurposes: batchPurposes,
            internalPass: true, finalPass: !willWire && isLast, buildComplexity,
          });
        }
        if (!res.ok) return { hardFailed: true, missing: batch };
        let stillMissing = batchPaths.filter((p) => filesRef.current[p] === undefined);
        if (stillMissing.length > 0 && passCount < MAX_INTERNAL_PASSES && !isStale()) {
          passCount += 1;
          await new Promise((r) => setTimeout(r, 300));
          if (isStale()) return { hardFailed: false, missing: batch.filter((f) => stillMissing.includes(f.path)) };
          const missingBatch = batch.filter((f) => stillMissing.includes(f.path));
          await fireStage({
            stage: 'fill', stageFiles: missingBatch.map((f) => f.path), stagePurposes: missingBatch.map((f) => f.purpose),
            internalPass: true, finalPass: !willWire && isLast, buildComplexity,
          });
          await new Promise((r) => setTimeout(r, 300));
          stillMissing = stillMissing.filter((p) => filesRef.current[p] === undefined);
        }
        return { hardFailed: false, missing: batch.filter((f) => stillMissing.includes(f.path)) };
      };

      if (hasFills && !isStale()) {
        const affordable = Math.max(0, MAX_INTERNAL_PASSES - passCount);
        const batchesToRun = staged.fillBatches.slice(0, affordable);
        // Dispatched concurrently — verified safe on the web app (see
        // scripts/_verify-concurrent-fill-sonnet.mjs in that repo), each
        // batch independent of the others at dispatch time.
        const results = await Promise.all(batchesToRun.map((b, i) => runFillBatch(b, i, i === batchesToRun.length - 1)));
        const hardFailedFiles = results.filter((r) => r.hardFailed).flatMap((r) => r.missing);
        for (const r of results) if (!r.hardFailed) unresolvedFiles.push(...r.missing);
        if (hardFailedFiles.length > 0) {
          const names = hardFailedFiles.slice(0, 3).map((f) => f.path.split('/').pop()).join(', ');
          completedProgress.push(`${hardFailedFiles.length} screen(s) couldn't be generated (${names}) — send "complete the build" to finish.`);
        }
      }
      if (unresolvedFiles.length > 0) {
        const names = unresolvedFiles.slice(0, 3).map((f) => f.path.split('/').pop()).join(', ');
        completedProgress.push(`${unresolvedFiles.length} planned screen(s) are still placeholders (${names}) — send "finish them" to complete the build.`);
      }

      if (routerPath && passCount < MAX_INTERNAL_PASSES && !isStale()) {
        const builtScreens = staged.files.filter(
          (f) => !staged.scaffoldPaths.includes(f.path) && filesRef.current[f.path] !== undefined,
        );
        if (builtScreens.length > 0) {
          passCount += 1;
          completedProgress.push('Wiring the real screens into the app shell');
          paintBubble('');
          await new Promise((r) => setTimeout(r, 300));
          // Re-checked after the sleep, same reasoning as the fill-batch
          // retry above.
          if (!isStale()) {
            await fireStage({
              stage: 'wire', stageFiles: [routerPath], stagePurposes: builtScreens.map((f) => `${f.path}: ${f.purpose}`),
              internalPass: true, finalPass: true, buildComplexity,
            });
          }
        }
      }

      if (isStale()) return;
      await finishTurn('');
    } catch (e) {
      if (!isStale()) {
        setMessages((m) =>
          m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: (e as Error).message, streaming: false } : x)),
        );
      }
    } finally {
      // A stale (cancelled/superseded) generation's own cleanup must never
      // touch these — they're shared, single refs, and by the time a stale
      // generation's async work actually settles, a NEWER generation may
      // already own them (its own activeHandlesRef entries, its own busy
      // state). Only the CURRENT generation resets them.
      if (!isCurrentGen()) return;
      activeHandlesRef.current = [];
      handleRef.current = null;
      runningRef.current = false;
      if (!goneRef.current) {
        setBusy(false);
        refreshCredits();
      }
    }
  }, [id, user, type, t, refreshCredits, autoPreview, router, modelTier, tierTouched]);

  const run = useCallback(
    (promptText: string, displayText?: string, opts?: { consumeImage?: boolean; skipUserEcho?: boolean; isAutoFix?: boolean }) => {
      // chatBusy/chatRunningRef included here (not just in dispatchTurn's
      // guard) because run() has other entry points that bypass dispatchTurn
      // entirely — the self-heal timer and its "Try again" banner button,
      // AutoFix, Connectors, Plan Mode. Without this, one of those firing
      // while a free /api/assist reply is still in flight could start a
      // paid build concurrently with it.
      if (!id || !user?.id || busy || chatBusy || chatRunningRef.current || runningRef.current || !promptText.trim()) return;
      runningRef.current = true;
      backgroundedDuringRunRef.current = false;
      cancelledRef.current = false;
      buildGenRef.current += 1;
      const myGen = buildGenRef.current;
      // A fresh self-heal budget only on a genuinely new user turn — never on
      // the autofix retry itself (that was the original infinite-loop bug web
      // hit: resetting on every generation flipped the budget, effectively
      // unbounded). See the auto-heal effect below.
      if (!opts?.isAutoFix) {
        healCountRef.current = 0;
        setHealFailed(false);
      }
      const prompt = promptText.trim();
      // Snapshot for Undo — only for a real edit turn on an existing project
      // (never a first build, never the autofix retry itself, which would
      // otherwise checkpoint the already-broken state as an "undo point").
      if (!opts?.isAutoFix && Object.keys(files).length > 0) {
        checkpointsRef.current.push({ files, label: (displayText ?? prompt).slice(0, 40) || 'Before edit' });
        if (checkpointsRef.current.length > 20) checkpointsRef.current = checkpointsRef.current.slice(-20);
        setHasCheckpoint(true);
      }
      setInput('');
      setBusy(true);
      setAutoFixError(null);
      thunk();

      // displayText lets the chat bubble show the user's own words while the
      // model receives a richer spec (used by Plan Mode → build).
      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: (displayText ?? prompt).trim() };
      const aId = `a${Date.now()}`;
      const assistant: Msg = { id: aId, role: 'assistant', text: '', progress: [], streaming: true };
      // skipUserEcho: dispatchTurn's chat lane already echoed the user's
      // message and persisted it before handing off here (the assist
      // endpoint reclassified a "chat" message as a real build) — echoing it
      // again would show the user's own words twice in a row.
      if (opts?.skipUserEcho) {
        setMessages((m) => [...m, assistant]);
      } else {
        setMessages((m) => [...m, userMsg, assistant]);
        saveMessage(id, 'user', userMsg.text, { clientId: userMsg.id });
      }
      // Conversation context for the model: the last few turns BEFORE this one
      // (same shape the web ChatPanel sends). Persist the user turn immediately
      // so history survives even if the build is cancelled mid-stream.
      const history = windowedHistory(
        messages.filter((m): m is Extract<Msg, { role: 'user' | 'assistant' }> => m.role !== 'suggestions'),
      ).map((m) => ({ role: m.role, content: m.text }));

      // AutoFix and the Connectors sheet fire their own generated prompts —
      // a photo the user staged for their OWN next message must not get
      // silently spent on one of those instead (it would just vanish with no
      // indication why, and the user's real message would send without it).
      const consumeImage = opts?.consumeImage ?? true;
      const image = consumeImage && pendingImageRef.current
        ? { base64: pendingImageRef.current.base64, mimeType: pendingImageRef.current.mimeType }
        : undefined;
      if (consumeImage) clearPendingImage();

      // Same "don't silently eat the user's staged attachment" reasoning as
      // the image above — AutoFix/Connectors pass consumeImage:false for
      // their own system-generated prompts.
      const pendingDocs = consumeImage ? pendingDocsRef.current : [];
      const attachedText = pendingDocs.some((d) => d.kind === 'text')
        ? pendingDocs.filter((d) => d.kind === 'text').map((d) => ({ name: d.name, content: d.content! }))
        : undefined;
      const documents = pendingDocs.some((d) => d.kind === 'pdf')
        ? pendingDocs.filter((d) => d.kind === 'pdf').map((d) => ({ name: d.name, base64: d.base64! }))
        : undefined;
      if (consumeImage) { pendingDocsRef.current = []; setPendingDocNames([]); }

      // A brand-new project (no files yet), no image or document attached,
      // agent-team on → stage the build instead of one giant request. See
      // runStagedBuild's comment above for why this matters: mobile used to
      // always take the one-shot 'full' path regardless of size, which is
      // the exact path the web app moved away from because it caused
      // mid-build timeouts, incomplete files, and scaffold placeholders that
      // never got wired up. Attachments skip staging same as web: the plan
      // pass never sees them, so its manifest would be a blind guess.
      if (AGENT_TEAM_ENABLED && !image && !attachedText && !documents && Object.keys(files).length === 0) {
        runStagedBuild(prompt, aId, history, userMsg.text, myGen);
        return;
      }

      handleRef.current = streamGenerate(
        { prompt, projectId: id, userId: user.id, projectType: type, files, history, image, attachedText, documents, modelTier: tierTouched ? modelTier : undefined },
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
            // buildGenRef check: XHR abort() isn't guaranteed on every
            // platform to suppress a callback already in flight — this is
            // the same generation guard runStagedBuild uses, so a response
            // that lands after cancel() (or after a newer build superseded
            // this one) can never write into files it no longer owns.
            if (goneRef.current || buildGenRef.current !== myGen) return;
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
                if (!goneRef.current) {
                  setMessages((m) => [...m, { id: `sg${Date.now()}`, role: 'suggestions', items: NEXT_STEP_SUGGESTIONS }]);
                }
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
            if (goneRef.current || buildGenRef.current !== myGen) return;
            warn();
            // Turn the raw "Build failed (402): Not enough credits…" into a calm
            // nudge to top up on the web (where credits are bought via Dodo).
            const outOfCredits = /\b402\b|not enough credits|insufficient/i.test(msg);
            // A network/timeout failure right after the app was backgrounded is
            // almost always the connection dropping while switched away, not a
            // real service issue — say so plainly and hand the prompt back
            // pre-filled so retrying is one tap, not a retype.
            const droppedInBackground =
              backgroundedDuringRunRef.current && /network|timeout/i.test(msg);
            const shown = outOfCredits
              ? t('outOfCreditsBody')
              : droppedInBackground
                ? 'Build interrupted — switching apps dropped the connection. Your prompt is back in the box, ready to send again.'
                : msg;
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
            } else if (droppedInBackground) {
              setInput(prompt);
            }
            runningRef.current = false;
            setBusy(false);
            refreshCredits();
          },
        },
      );
    },
    [id, user?.id, busy, chatBusy, type, files, messages, refreshCredits, autoPreview, router, t, clearPendingImage, runStagedBuild, modelTier, tierTouched],
  );

  // Always-fresh handle on run() for the auto-heal timer below — that timer
  // is scheduled once (on the autoFixError/busy transition) and must invoke
  // whatever run() closure is current when it FIRES, not whichever one
  // existed at schedule time (files/messages may have moved on by then).
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; }, [run]);

  // Self-heal: automatically retry a broken preview instead of waiting for
  // the user to notice the banner and tap "Fix it" — mirrors web's bounded
  // auto-trigger (PreviewPanel.tsx MAX_HEAL). Fires once budget/backoff
  // allows; gives up after MAX_HEAL and reverts to the last preview that
  // actually rendered rather than leaving a broken one on screen.
  useEffect(() => {
    if (!autoFixError || busy || chatBusy) return;
    if (healCountRef.current >= MAX_HEAL) {
      setHealFailed(true);
      if (lastGoodRevealRef.current) setReveal(lastGoodRevealRef.current);
      return;
    }
    const err = autoFixError;
    const delay = healCountRef.current === 0 ? 1500 : 3000;
    const timer = setTimeout(() => {
      if (goneRef.current) return;
      // Only counted as a real attempt once it actually fires — incrementing
      // at schedule time instead let an unrelated busy/chatBusy change
      // (e.g. the user sending a chat message during the wait) re-run this
      // effect, whose cleanup cancels the pending timer but wouldn't have
      // rolled back the counter, spending budget on attempts that never ran.
      healCountRef.current += 1;
      setAutoFixError(null);
      runRef.current(autoFixPrompt(err), undefined, { consumeImage: false, isAutoFix: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [autoFixError, busy, chatBusy]);
  useEffect(() => { if (!autoFixError) setHealFailed(false); }, [autoFixError]);

  // The conversational lane (see lib/intent.ts) — echoes the user's message,
  // then hits /api/assist for a free reply. If the server decides this was
  // actually a build/edit request after all (forceChat:false's Haiku check,
  // or the reply model's own mid-answer handoff), it hands off to run() with
  // skipUserEcho so the message isn't shown twice.
  const runChat = useCallback(
    (promptText: string, forceChat: boolean) => {
      if (!id || !user?.id || busy || chatBusy || chatRunningRef.current) return;
      chatRunningRef.current = true;
      setInput('');
      setChatBusy(true);
      thunk();
      const userMsg: Msg = { id: `u${Date.now()}`, role: 'user', text: promptText };
      const aId = `a${Date.now()}`;
      const assistant: Msg = { id: aId, role: 'assistant', text: '', streaming: true };
      const history = windowedHistory(
        messages.filter((m): m is Extract<Msg, { role: 'user' | 'assistant' }> => m.role !== 'suggestions'),
      ).map((m) => ({ role: m.role, content: m.text }));
      setMessages((m) => [...m, userMsg, assistant]);
      saveMessage(id, 'user', userMsg.text, { clientId: userMsg.id });

      streamAssist(
        {
          prompt: promptText,
          fileContext: toFileContext(files),
          history,
          hasFiles: Object.keys(files).length > 0,
          forceChat,
          projectId: id,
        },
        {
          onDone: (result) => {
            if (goneRef.current) return;
            chatRunningRef.current = false;
            setChatBusy(false);
            if (result.intent === 'action') {
              // Drop the placeholder chat bubble — run() creates the real
              // one, using the model's restatement as a far better build
              // prompt than the bare original message.
              setMessages((m) => m.filter((x) => x.id !== aId));
              run(result.handoffPrompt, promptText, { skipUserEcho: true });
              return;
            }
            setMessages((m) =>
              m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: result.text, streaming: false } : x)),
            );
            saveMessage(id, 'assistant', result.text, { clientId: aId });
          },
          onError: (msg) => {
            if (goneRef.current) return;
            chatRunningRef.current = false;
            setChatBusy(false);
            // Never show the raw server/network string here — streamAssist's
            // message can be up to 200 chars of a raw response body. Same
            // friendly framing the paid lane (run()'s onError) already uses.
            const droppedInBackground = backgroundedDuringRunRef.current && /network|timeout/i.test(msg);
            const shown = /session expired/i.test(msg)
              ? msg
              : droppedInBackground
                ? 'Switching apps dropped the connection — try sending that again.'
                : 'Couldn\'t reach the assistant — try again in a moment.';
            setMessages((m) =>
              m.map((x) => (x.id === aId && x.role === 'assistant' ? { ...x, text: shown, streaming: false } : x)),
            );
          },
        },
      );
    },
    [id, user?.id, busy, chatBusy, messages, files, run],
  );

  // The ONE entry point for the send box — classify BEFORE deciding whether
  // to spend credits. Every other call site (AutoFix, Connectors, Plan Mode,
  // the initial new-project prompt) sends its own system-generated action
  // prompt straight to run() and deliberately skips this: classification is
  // only for raw text a person actually typed.
  // Pre-gen dependency gate (see lib/detect-deps.ts) — only for a genuinely
  // new build (no files yet) with no image attached (a screenshot-to-app
  // build never needs this). Checks the user's saved secrets and, if
  // something the prompt implies it needs is missing, shows the gate
  // instead of spending credits on code that references keys that don't
  // exist. Returns true if the gate was shown (caller must not proceed).
  const runDepGateCheck = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (Object.keys(files).length > 0 || pendingImageRef.current) return false;
      const deps = detectDeps(prompt);
      if (!deps.hasAnyDep) return false;
      let existingNames: Set<string> = new Set();
      try {
        existingNames = await listSecretNames();
      } catch {
        /* couldn't check — proceed rather than block on a network blip */
      }
      const has = (needle: string) => Array.from(existingNames).some((n) => n.includes(needle));
      const missingSupabase = deps.needsSupabase && !has('SUPABASE');
      const missingStripe = deps.needsStripe && !has('STRIPE');
      const missingComposio = deps.composioTools.filter((t) => !has(t.toUpperCase()));
      if (!missingSupabase && !missingStripe && missingComposio.length === 0) return false;
      const initialSecrets: Record<string, string> = {};
      if (missingSupabase) { initialSecrets.SUPABASE_URL = ''; initialSecrets.SUPABASE_ANON_KEY = ''; }
      if (missingStripe) initialSecrets.STRIPE_PUBLISHABLE_KEY = '';
      for (const t of missingComposio) initialSecrets[`${t.toUpperCase()}_API_KEY`] = '';
      setInlineSecrets(initialSecrets);
      setPendingGenArgs({ prompt, needsSupabase: missingSupabase, needsStripe: missingStripe, composioTools: missingComposio });
      return true;
    },
    [files],
  );

  const proceedToBuild = useCallback(
    async (prompt: string) => {
      const gated = await runDepGateCheck(prompt);
      if (!gated) run(prompt);
    },
    [runDepGateCheck, run],
  );

  const dispatchTurn = useCallback(
    async (text: string) => {
      if (!id || !user?.id || busy || chatBusy || runningRef.current || chatRunningRef.current || !text.trim()) return;
      const prompt = text.trim();
      const hasFiles = Object.keys(files).length > 0;
      const hasAttachment = !!pendingImageRef.current || pendingDocsRef.current.length > 0;
      // An attachment strongly implies "do something with this," never "just
      // chatting" — classifying it anyway risked routing straight to the free
      // chat lane, which never consumes pendingImageRef/pendingDocsRef, and
      // silently dropping whatever the user just attached. Matches web's
      // dispatchTurn, which skips classification entirely when img/attachments
      // are present.
      if (!hasAttachment) {
        const intent = classifyIntent(prompt, hasFiles);
        if (intent === 'CHAT' || intent === 'AMBIGUOUS') {
          runChat(prompt, intent === 'CHAT');
          return;
        }
      }
      // Regulated-domain notice (non-blocking) — only for a genuinely new
      // build with no image attached; skipped once the user has already
      // continued past it for this exact prompt.
      if (!hasFiles && !pendingImageRef.current) {
        const regulated = detectRegulated(prompt);
        if (regulated.length > 0) {
          setInput('');
          setPendingRegulated({ prompt, domains: regulated });
          return;
        }
      }
      await proceedToBuild(prompt);
    },
    [id, user?.id, busy, chatBusy, files, runChat, proceedToBuild],
  );

  const saveSecretsAndBuild = useCallback(async () => {
    if (!pendingGenArgs) return;
    setSecretSaving(true);
    try {
      for (const [name, value] of Object.entries(inlineSecrets)) {
        if (!value.trim()) continue;
        await saveSecret(name, value.trim()).catch(() => {});
      }
    } finally {
      const { prompt } = pendingGenArgs;
      setInlineSecrets({});
      setSecretSaving(false);
      setPendingGenArgs(null);
      run(prompt);
    }
  }, [pendingGenArgs, inlineSecrets, run]);

  const onPickSuggestion = useCallback((s: Suggestion) => {
    setInput(s.prompt);
    inputRef.current?.focus();
  }, []);

  // Cancel an in-flight build — abort the stream, unlock the UI, and close out
  // the streaming bubble. Guarantees recovery even if the network never replies.
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    // Invalidates whatever generation is currently active (run()'s captured
    // myGen no longer matches) without needing to know its specific number —
    // any in-flight response for it, however it eventually lands, is then
    // recognized as stale and never writes files or resets state a NEWER
    // build may already own.
    buildGenRef.current += 1;
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

  const doUndo = useCallback(() => {
    if (!id || checkpointsRef.current.length === 0) return;
    const cp = checkpointsRef.current.pop()!;
    setHasCheckpoint(checkpointsRef.current.length > 0);
    filesRef.current = cp.files;
    setFiles(cp.files);
    saveFiles(id, cp.files).catch(() => {});
    autoPreview(cp.files);
    setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: `Reverted to before "${cp.label}"`, streaming: false }]);
    showToast('Reverted', 'success');
  }, [id, autoPreview, showToast]);

  // Visual Edits — free, direct-to-source. applyClassEdit/applyTextEdit
  // never guess (ambiguous or missing match → ok:false), so a failure here
  // always has a safe fallback: the paid but scoped "Ask AI" lane below.
  const applyVisualClasses = useCallback(
    (nextClasses: string) => {
      if (!id || !selectedEl || nextClasses === selectedEl.classes) return;
      const result = applyClassEdit(files, selectedEl.loc, selectedEl.classes, nextClasses);
      if (!result.ok) {
        showToast('Too ambiguous to change safely — try Ask AI', 'error');
        return;
      }
      filesRef.current = result.files;
      setFiles(result.files);
      saveFiles(id, result.files).catch(() => {});
      previewBridgeRef.current?.postMessage(JSON.stringify({ type: 'wyber-set-class', selector: selectedEl.selector, className: nextClasses }));
      setSelectedEl({ ...selectedEl, classes: nextClasses });
    },
    [id, selectedEl, files, showToast],
  );

  const applyVisualText = useCallback(
    (newText: string) => {
      if (!id || !selectedEl) return;
      const result = applyTextEdit(files, selectedEl.loc, selectedEl.text, newText);
      if (!result.ok) {
        showToast('Too ambiguous to change safely — try Ask AI', 'error');
        return;
      }
      filesRef.current = result.files;
      setFiles(result.files);
      saveFiles(id, result.files).catch(() => {});
      saveVersion(id, result.files, `Edited text on <${selectedEl.tag}>`);
      previewBridgeRef.current?.postMessage(JSON.stringify({ type: 'wyber-set-text', selector: selectedEl.selector, text: newText }));
      setSelectedEl({ ...selectedEl, text: newText });
      showToast('Updated — free', 'success');
    },
    [id, selectedEl, files, showToast],
  );

  const onVisualStep = useCallback(
    (family: StepFamily, dir: 1 | -1) => {
      if (!selectedEl) return;
      applyVisualClasses(stepClass(selectedEl.classes, family, dir));
    },
    [selectedEl, applyVisualClasses],
  );

  const onVisualColor = useCallback(
    (prop: 'text' | 'bg', token: string) => {
      if (!selectedEl) return;
      applyVisualClasses(setColorClass(selectedEl.classes, prop, token));
    },
    [selectedEl, applyVisualClasses],
  );

  // Structural fallback — a real, scoped chat edit (paid), for anything a
  // slider/stepper can't express. Never the free lane.
  const onVisualAskAI = useCallback(
    (instruction: string) => {
      if (!selectedEl) return;
      const desc = `Edit this exact element (the user tapped it in the preview):\n- Element: <${selectedEl.tag}>${selectedEl.classes ? ` with classes "${selectedEl.classes}"` : ''}${selectedEl.loc ? `\n- Source location: ${selectedEl.loc}` : ''}\n- Text content: "${selectedEl.text}"\n- CSS path: ${selectedEl.selector}\n\nChange requested: ${instruction}`;
      setSelectedEl(null);
      setSelectMode(false);
      run(desc, `Edit: ${instruction}`, { consumeImage: false });
    },
    [selectedEl, run],
  );

  const doPublish = useCallback(
    async (override = false) => {
      if (!id || publishing) return;
      setPublishing(true);
      try {
        const result = await publishProject(id, override);
        if (goneRef.current) return;
        if (result.ok) {
          Alert.alert('Published', 'Your app is live.', [
            { text: 'Open', onPress: () => WebBrowser.openBrowserAsync(result.publishedUrl).catch(() => {}) },
            { text: 'Share', onPress: () => Share.share({ message: result.publishedUrl, url: result.publishedUrl }).catch(() => {}) },
            { text: 'Done', style: 'cancel' },
          ]);
        } else if (result.blocked) {
          Alert.alert('Security check', result.message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Publish anyway', style: 'destructive', onPress: () => doPublish(true) },
          ]);
        } else {
          Alert.alert('Publish failed', result.error);
        }
      } catch (e) {
        if (!goneRef.current) Alert.alert('Publish failed', (e as Error).message || 'Something went wrong.');
      } finally {
        if (!goneRef.current) setPublishing(false);
      }
    },
    [id, publishing],
  );

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

  const buildActionFor = (pt: ProjectType) =>
    pt === 'mobile' ? 'mobile-build' : pt === 'website' ? 'website-build' : pt === 'saas' ? 'saas-build' : 'web-build';
  const estimateAction = hasFiles ? 'small-edit' : buildActionFor(type);
  // The real build size (small/medium/large/xl) is only known after the free
  // plan pass runs (see runStagedBuild's totalPlannedFiles) — a single flat
  // number here (no buildTier) doesn't match any real tiered price and can
  // understate the true ceiling by up to ~4x. Passing the small/xl bounds
  // gives an honest range instead; for edits (not a BUILD_ACTION) creditCost
  // ignores buildTier entirely, so lo === hi and this still shows one exact
  // number there.
  const costLabel = (tier: ModelTier) => {
    const lo = creditCost(estimateAction, tier, 'small');
    const hi = creditCost(estimateAction, tier, 'xl');
    return lo === hi ? `${lo}cr` : `${lo}–${hi}cr`;
  };
  const onPickTier = (tier: ModelTier) => {
    if (tierAllowedForPlan(tier, userPlan)) {
      tap();
      setModelTier(tier);
      setTierTouched(true);
      return;
    }
    const meta = MODEL_META[tier];
    const planLabel = meta.minPlan.charAt(0).toUpperCase() + meta.minPlan.slice(1);
    Alert.alert(
      `${meta.label} needs ${planLabel}+`,
      `Upgrade to the ${planLabel} plan or higher to use ${meta.label} for builds and edits.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/paywall') },
      ],
    );
  };

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

      {loadError ? (
        <View style={styles.center}>
          <Text style={styles.emptyBody}>Couldn't load this project.</Text>
          <Pressable onPress={loadProject} hitSlop={8} style={{ marginTop: 12 }}>
            <Text style={[styles.emptyBody, { color: brand.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : !loaded ? (
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

      {planState === 'none' && autoFixError && !busy && !healFailed ? (
        <View style={styles.autoFixBanner}>
          <ActivityIndicator size="small" color={brand.warning} />
          <Text style={styles.autoFixText} numberOfLines={2}>
            Preview error — fixing it automatically…
          </Text>
          <Pressable onPress={() => setAutoFixError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={brand.textMuted} />
          </Pressable>
        </View>
      ) : planState === 'none' && autoFixError && !busy && healFailed ? (
        <View style={styles.autoFixBanner}>
          <Ionicons name="warning-outline" size={16} color={brand.danger} />
          <Text style={styles.autoFixText} numberOfLines={2}>
            {lastGoodRevealRef.current ? 'Couldn\'t auto-fix — showing your last working version.' : 'Couldn\'t auto-fix this one.'}
          </Text>
          <Pressable
            onPress={() => {
              const err = autoFixError;
              setAutoFixError(null);
              healCountRef.current = 0;
              setHealFailed(false);
              run(autoFixPrompt(err), undefined, { consumeImage: false });
            }}
            style={styles.autoFixConfirm}
          >
            <Text style={styles.autoFixConfirmText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => setAutoFixError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={brand.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {planState === 'none' && mentionQuery !== null ? (
        <FileMentionPicker query={mentionQuery} files={Object.keys(files)} onPick={onPickMention} />
      ) : null}

      {planState === 'none' && pendingRegulated ? (
        <View style={styles.regulatedPanel}>
          <View style={styles.regulatedHeaderRow}>
            <Ionicons name="warning-outline" size={18} color={brand.warning} />
            <Text style={styles.regulatedTitle}>Handling sensitive data</Text>
          </View>
          <Text style={styles.regulatedBody}>
            This looks like it involves {pendingRegulated.domains.map((d) => d.label).join(' and ')} — worth knowing before you build:
          </Text>
          {pendingRegulated.domains.map((d) => (
            <View key={d.label} style={styles.regulatedItem}>
              <Text style={styles.regulatedItemText}>
                <Text style={{ fontWeight: '700' }}>{d.label}:</Text> {d.requirement}
              </Text>
            </View>
          ))}
          <View style={styles.gateActions}>
            <Pressable
              style={styles.gateSaveBtn}
              onPress={() => {
                const { prompt } = pendingRegulated;
                setPendingRegulated(null);
                proceedToBuild(prompt);
              }}
            >
              <Text style={styles.gateSaveBtnText}>Continue anyway</Text>
            </Pressable>
            <Pressable
              style={styles.gateSkipBtn}
              onPress={() => {
                setInput(pendingRegulated.prompt);
                setPendingRegulated(null);
              }}
            >
              <Text style={styles.gateSkipBtnText}>Edit</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {planState === 'none' && pendingGenArgs ? (
        <View style={styles.gatePanel}>
          <View style={styles.regulatedHeaderRow}>
            <Ionicons name="key-outline" size={16} color={brand.accent} />
            <Text style={styles.regulatedTitle}>This build needs some keys</Text>
          </View>
          <Text style={styles.regulatedBody}>
            Add them now so the generated code actually works, or build without a backend and wire it up later.
          </Text>
          {pendingGenArgs.needsSupabase ? (
            <View style={styles.gateSection}>
              <Text style={styles.gateSectionTitle}>🗄 Supabase</Text>
              {['SUPABASE_URL', 'SUPABASE_ANON_KEY'].map((key) => (
                <TextInput
                  key={key}
                  style={styles.gateInput}
                  placeholder={key === 'SUPABASE_URL' ? 'https://xxxx.supabase.co' : 'eyJhbGci...'}
                  placeholderTextColor={brand.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={inlineSecrets[key] ?? ''}
                  onChangeText={(v) => setInlineSecrets((s) => ({ ...s, [key]: v }))}
                />
              ))}
            </View>
          ) : null}
          {pendingGenArgs.needsStripe ? (
            <View style={styles.gateSection}>
              <Text style={styles.gateSectionTitle}>💳 Stripe</Text>
              <TextInput
                style={styles.gateInput}
                placeholder="pk_live_... or pk_test_..."
                placeholderTextColor={brand.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                value={inlineSecrets.STRIPE_PUBLISHABLE_KEY ?? ''}
                onChangeText={(v) => setInlineSecrets((s) => ({ ...s, STRIPE_PUBLISHABLE_KEY: v }))}
              />
            </View>
          ) : null}
          {pendingGenArgs.composioTools.length > 0 ? (
            <View style={styles.gateSection}>
              <Text style={styles.gateSectionTitle}>{pendingGenArgs.composioTools.join(', ')} needed</Text>
              <Text style={styles.regulatedBody}>Connect these from the Connectors panel after this build.</Text>
            </View>
          ) : null}
          <View style={styles.gateActions}>
            <Pressable style={styles.gateSaveBtn} onPress={saveSecretsAndBuild} disabled={secretSaving}>
              {secretSaving ? (
                <ActivityIndicator color={brand.onAccent} size="small" />
              ) : (
                <Text style={styles.gateSaveBtnText}>Save keys & build</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.gateSkipBtn}
              onPress={() => {
                const { prompt } = pendingGenArgs;
                setInlineSecrets({});
                setPendingGenArgs(null);
                run(prompt);
              }}
            >
              <Text style={styles.gateSkipBtnText}>Build without backend</Text>
            </Pressable>
          </View>
        </View>
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

      {planState === 'none' && pendingDocNames.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingDocsRow}>
          {pendingDocNames.map((name) => (
            <View key={name} style={styles.pendingDocChip}>
              <Ionicons name={/\.pdf$/i.test(name) ? 'document-outline' : 'reader-outline'} size={13} color={brand.accent} />
              <Text style={styles.pendingDocText} numberOfLines={1}>{name}</Text>
              <Pressable onPress={() => removePendingDoc(name)} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={brand.textMuted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {planState === 'none' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.modelRow}
        >
          {PICKABLE_TIERS.map((tier) => {
            const meta = MODEL_META[tier];
            const allowed = tierAllowedForPlan(tier, userPlan);
            const active = tierTouched && modelTier === tier;
            return (
              <Pressable
                key={tier}
                onPress={() => onPickTier(tier)}
                style={[styles.tierPill, active && styles.tierPillActive, !allowed && styles.tierPillDisabled]}
              >
                <Text style={[styles.tierPillText, active && styles.tierPillTextActive]}>
                  {meta.label} · {costLabel(tier)}{!allowed ? ' 🔒' : ''}
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.costChip}>
            <Ionicons name="flash-outline" size={11} color={brand.textFaint} />
            <Text style={styles.costChipText}>
              {tierTouched
                ? `~${costLabel(modelTier)}`
                : `~${creditCost(estimateAction, 'fast', 'small')}–${creditCost(estimateAction, 'default', 'xl')}cr`}
            </Text>
          </View>
        </ScrollView>
      )}

      {planState === 'none' && (
      <View style={styles.inputBar}>
        <Pressable onPress={pickImage} disabled={busy || chatBusy} hitSlop={8} style={styles.cameraBtn}>
          <Ionicons name="camera-outline" size={22} color={busy || chatBusy ? brand.textFaint : brand.textMuted} />
        </Pressable>
        <Pressable onPress={pickDocument} disabled={busy || chatBusy} hitSlop={8} style={styles.cameraBtn}>
          <Ionicons name="attach-outline" size={22} color={busy || chatBusy ? brand.textFaint : brand.textMuted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={hasFiles ? t('describeChange') : t('describeApp')}
          placeholderTextColor={brand.textFaint}
          value={input}
          onChangeText={setInput}
          multiline
          editable={!busy && !chatBusy}
        />
        <MicButton value={input} onChangeText={setInput} disabled={busy || chatBusy} size={40} />
        <Pressable
          onPress={busy ? cancel : () => dispatchTurn(input)}
          disabled={chatBusy || (!busy && !input.trim())}
          accessibilityLabel={busy ? t('cancelBuild') : t('send')}
          style={({ pressed }) => [
            styles.send,
            (chatBusy || (!busy && !input.trim())) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          {busy ? (
            <Ionicons name="stop" size={18} color={brand.onAccent} />
          ) : chatBusy ? (
            <ActivityIndicator color={brand.onAccent} size="small" />
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
            icon: 'rocket-outline',
            label: publishing ? 'Publishing…' : 'Publish',
            description: 'Put this app live at a public URL',
            onPress: () => doPublish(false),
          },
          {
            icon: 'arrow-undo-outline',
            label: 'Undo',
            description: hasCheckpoint ? 'Revert your last edit — instant, free' : 'Nothing to undo yet',
            onPress: () => {
              setToolsOpen(false);
              doUndo();
            },
          },
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
          onLoadError={() => setReveal({ phase: 'error' })}
          selectMode={selectMode}
          onToggleSelectMode={type !== 'mobile' ? () => setSelectMode((v) => !v) : undefined}
          onElementSelected={(info) => { setSelectedEl(info); setSelectMode(false); }}
          bridgeRef={previewBridgeRef}
        />
      </SafeWidget>

      <VisualEditSheet
        visible={!!selectedEl}
        element={selectedEl}
        onClose={() => setSelectedEl(null)}
        onApplyText={applyVisualText}
        onStep={onVisualStep}
        onSetColor={onVisualColor}
        onAskAI={onVisualAskAI}
      />

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
  pendingDocsRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: brand.surface },
  pendingDocChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 160,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
  },
  pendingDocText: { color: brand.text, fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  regulatedPanel: {
    padding: space.md,
    gap: space.sm,
    backgroundColor: '#1a1206',
    borderTopWidth: 1,
    borderTopColor: 'rgba(245,158,11,0.25)',
  },
  gatePanel: {
    padding: space.md,
    gap: space.sm,
    backgroundColor: brand.surface,
    borderTopWidth: 1,
    borderTopColor: brand.border,
  },
  regulatedHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  regulatedTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  regulatedBody: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  regulatedItem: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: radius.sm,
    padding: space.sm,
  },
  regulatedItemText: { color: brand.warning, fontSize: 12, lineHeight: 17 },
  gateSection: { gap: space.xs },
  gateSectionTitle: { color: brand.text, fontSize: 12.5, fontWeight: '700' },
  gateInput: {
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm - 2,
    color: brand.text,
    fontSize: 12.5,
  },
  gateActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  gateSaveBtn: {
    flex: 1,
    backgroundColor: brand.accent,
    borderRadius: radius.sm,
    paddingVertical: space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  gateSaveBtnText: { color: brand.onAccent, fontSize: 13, fontWeight: '700' },
  gateSkipBtn: {
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateSkipBtnText: { color: brand.textMuted, fontSize: 12.5, fontWeight: '600' },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: brand.surface,
  },
  tierPill: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
  },
  tierPillActive: { backgroundColor: brand.accent, borderColor: brand.accent },
  tierPillDisabled: { opacity: 0.55 },
  tierPillText: { color: brand.textMuted, fontSize: 11.5, fontWeight: '600' },
  tierPillTextActive: { color: brand.onAccent },
  costChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
  },
  costChipText: { color: brand.textFaint, fontSize: 11, fontWeight: '600' },
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
