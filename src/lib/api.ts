import { supabase } from './supabase';
import {
  parseGenerationOutput,
  parseEditBlocks,
  applyEdits,
  hasEditBlocks,
} from './file-parser';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://wyberai.com';
export const PREVIEW_BUILDER =
  process.env.EXPO_PUBLIC_PREVIEW_BUILDER_URL ?? 'https://preview-builder.wyberai.com';

export type ProjectType = 'web' | 'mobile' | 'website' | 'saas';
export type FileMap = Record<string, { content: string; language?: string }>;

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fire first-run onboarding (welcome email + signup tracking). The server guards
 * it with an atomic once-per-user flip, so calling it on every fresh session is
 * safe and fires at most once. Fully fire-and-forget — never blocks the app.
 */
export async function triggerOnboarding(): Promise<void> {
  try {
    const token = await accessToken();
    if (!token) return;
    await fetch(`${API_BASE}/api/onboarding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* onboarding is best-effort — a failure must never affect sign-in */
  }
}

// Serialize a file map into the <file>…</file> manifest /api/generate expects
// as `fileContext` for follow-up edits. Empty string on a brand-new project.
export function toFileContext(files: FileMap): string {
  const entries = Object.entries(files || {});
  if (entries.length === 0) return '';
  return entries
    .map(([path, f]) => `<file path="${path}">\n${f.content}\n</file>`)
    .join('\n\n');
}

/**
 * Reject a promise if it hasn't settled in `ms`. RN's fetch (which supabase-js
 * uses) can hang indefinitely on a stalled connection with no error — without
 * this, "Start building" would spin forever. Surfaces a clear, retryable error.
 */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  // Accept a PromiseLike so supabase-js query builders (thenables, not real
  // Promises) can be passed straight in.
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out — check your connection and try again.`)), ms),
    ),
  ]);
}

/** Create a new project via RLS insert (mirrors the web app). Returns its id. */
export async function createProject(opts: {
  name: string;
  prompt: string;
  type: ProjectType;
}): Promise<string> {
  const { data: userData } = await withTimeout(supabase.auth.getUser(), 15_000, 'Sign-in check');
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');

  const { data, error } = await withTimeout(
    supabase
      .from('projects')
      .insert({
        name: opts.name,
        framework: opts.type === 'mobile' ? 'react-native' : 'react-vite',
        user_id: userId,
        initial_prompt: opts.prompt,
        project_type: opts.type,
      })
      .select('id')
      .single(),
    15_000,
    'Creating the project',
  );

  if (error) throw new Error(error.message);
  const projectId = data.id as string;
  // Smart-name it from the prompt (Haiku, 2-4 words), mirroring the web's
  // creation-time naming. Fire-and-forget: the endpoint is idempotent + guarded
  // (only renames while the name is still the raw prompt slice), so this never
  // blocks navigation and the title refreshes on the next screen load.
  autoNameProject(projectId, opts.prompt);
  return projectId;
}

/**
 * Ask the server to smart-name a project from its prompt (POST /api/projects/auto-name,
 * the same endpoint the web app uses). Best-effort; failures leave the optimistic
 * 4-word slice in place.
 */
export async function autoNameProject(projectId: string, prompt: string): Promise<void> {
  try {
    const token = await accessToken();
    if (!token) return;
    await fetch(`${API_BASE}/api/projects/auto-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, prompt }),
    });
  } catch {
    /* naming is best-effort */
  }
}

// {{wyber-image: <prompt> [| <ratio>]}} directive — mirrors web image-directives.ts.
const IMAGE_DIRECTIVE_RE = /\{\{\s*wyber-image\s*:\s*([^|}]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/gi;
function imageRatioToSize(ratio?: string): string {
  const r = (ratio || '').trim().toLowerCase();
  if (r === '1:1' || r === 'square' || r === '1024x1024') return '1024x1024';
  if (r === '9:16' || r === 'tall' || r === 'portrait' || r === '1024x1792') return '1024x1792';
  if (r === '16:9' || r === 'wide' || r === 'landscape' || r === 'banner' || r === '1792x1024') return '1792x1024';
  return '1792x1024';
}

/**
 * Swap {{wyber-image}} placeholder tokens for REAL persisted image URLs via the
 * shared /api/images/resolve-directives endpoint (same OpenAI cache the web
 * preview + publish use — one ~$0.06 generation per unique image, then free).
 * Best-effort: returns the files unchanged (labeled gradient placeholders remain)
 * on any failure. When it DOES change files, the caller should re-save so preview
 * and publish reuse them.
 */
export async function resolveImages(
  projectId: string,
  files: FileMap,
): Promise<{ files: FileMap; changed: boolean }> {
  try {
    const seen = new Map<string, { token: string; prompt: string; ratio: string }>();
    for (const f of Object.values(files)) {
      for (const m of (f.content || '').matchAll(IMAGE_DIRECTIVE_RE)) {
        const token = m[0];
        if (!seen.has(token)) seen.set(token, { token, prompt: (m[1] || '').trim(), ratio: imageRatioToSize(m[2]) });
      }
    }
    const directives = [...seen.values()];
    if (directives.length === 0) return { files, changed: false };

    const token = await accessToken();
    const res = await fetch(`${API_BASE}/api/images/resolve-directives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ projectId, directives }),
    });
    const data = (await res.json().catch(() => ({}))) as { urls?: Record<string, string> };
    if (!res.ok || !data.urls || Object.keys(data.urls).length === 0) return { files, changed: false };

    const next: FileMap = {};
    let changed = false;
    for (const [path, f] of Object.entries(files)) {
      let content = f.content || '';
      for (const [tok, url] of Object.entries(data.urls)) {
        if (url && content.includes(tok)) {
          content = content.split(tok).join(url);
          changed = true;
        }
      }
      next[path] = { ...f, content };
    }
    return { files: changed ? next : files, changed };
  } catch {
    return { files, changed: false };
  }
}

/** Read the signed-in user's current credit balance (0 if unknown). */
export async function fetchCredits(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return 0;
  const { data } = await supabase.from('profiles').select('credits').eq('id', userId).maybeSingle();
  return Number((data as { credits?: number } | null)?.credits ?? 0);
}

/** Save the full file map back to the project (Bearer-authenticated PATCH). */
export async function saveFiles(projectId: string, files: FileMap): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ projectId, files }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Save failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

/**
 * PRIMARY mobile preview: bundle the app via WyberAi's own react-native-web
 * bundler and return a self-contained HTML document to load inline in the
 * WebView. Zero external APIs — everything runs on WyberAi's own servers.
 * Timeout-guarded so a stalled bundle surfaces an error instead of spinning.
 */
export async function buildMobilePreviewHtml(projectId: string, files: FileMap): Promise<string> {
  const token = await accessToken();
  const res = await withTimeout(
    fetch(`${API_BASE}/api/rn-web-bundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files, projectId }),
    }),
    45_000,
    'Building the preview',
  );
  const data = (await res.json().catch(() => ({}))) as { html?: string; error?: string };
  if (!res.ok || !data.html) throw new Error(data.error || `Preview build failed (${res.status})`);
  return data.html;
}

/**
 * @deprecated — no longer used by the companion app. Call buildMobilePreviewHtml
 * instead (WyberAi's own bundler, zero external API dependency).
 * Kept to avoid breaking any callers that may reference it outside this repo.
 */
export async function buildMobilePreviewUrl(name: string, files: FileMap): Promise<string> {
  const { embedUrl } = await createSnack(name || 'WyberAi Mobile App', files);
  if (!embedUrl) throw new Error('Preview did not return a URL — please retry.');
  return embedUrl;
}

export type SnackResult = { snackId: string; snackUrl: string; embedUrl: string };

/**
 * Convert a generated mobile app into an Expo Snack — a permanent, shareable URL
 * where the app can be opened in Expo Go on a real device (QR/link) or run in the
 * browser web player. This is the "ship it / test on your phone" path for mobile
 * projects (they don't publish to a web URL like web apps do). Reuses the web
 * app's /api/snack (auth via the Bearer bridge in the server Supabase client).
 */
export async function createSnack(
  name: string,
  files: FileMap,
): Promise<SnackResult> {
  const token = await accessToken();
  // /api/snack wants a flat { path: contents } map, not our { content } shape.
  const flat: Record<string, string> = {};
  for (const [path, f] of Object.entries(files || {})) {
    if (f?.content) flat[path] = f.content;
  }
  const res = await withTimeout(
    fetch(`${API_BASE}/api/snack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files: flat, name }),
    }),
    30_000,
    'Converting to a mobile app',
  );
  const data = (await res.json().catch(() => ({}))) as Partial<SnackResult> & { error?: string };
  if (!res.ok || !data.snackUrl) throw new Error(data.error || `Convert failed (${res.status})`);
  return { snackId: data.snackId!, snackUrl: data.snackUrl, embedUrl: data.embedUrl! };
}

/**
 * Build a web-app preview and return a loadable URL. Goes through wyberai.com's
 * /api/preview-build (NOT the raw preview-builder) so the files are sanitized
 * server-side first — same guaranteed entry/config the desktop editor adds.
 * Posting raw files straight to the builder produced an entry-less project that
 * never rendered ("Preview isn't ready yet").
 */
export async function buildPreview(projectId: string, files: FileMap): Promise<string> {
  const res = await withTimeout(
    fetch(`${API_BASE}/api/preview-build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, projectId }),
    }),
    60_000,
    'Building the preview',
  );
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || `Preview build failed (${res.status})`);
  return data.url + (data.url.includes('?') ? '&' : '?') + 't=' + Date.now();
}

export type PublishResult =
  | { ok: true; publishedUrl: string; subdomain: string }
  | { ok: false; blocked: true; message: string } // critical RLS leak — offer "publish anyway"
  | { ok: false; blocked: false; error: string };

/**
 * Publish a WEB project live (mirrors the web editor's Publish). Runs the same
 * server-side secret + RLS gates. A critical RLS leak returns 409 → we surface
 * it so the user can retry with `override: true`.
 */
export async function publishProject(projectId: string, override = false): Promise<PublishResult> {
  const token = await accessToken();
  // Publish runs a security scan + image generation + a build server-side, so it
  // can take a while — but it must NOT hang the button forever if the connection
  // stalls. Cap it so the caller always resolves (the "stuck spinner" fix).
  const res = await withTimeout(
    fetch(`${API_BASE}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ projectId, override }),
    }),
    120_000,
    'Publishing',
  );
  const data = (await res.json().catch(() => ({}))) as {
    publishedUrl?: string;
    subdomain?: string;
    blocked?: boolean;
    message?: string;
    error?: string;
  };
  if (res.status === 409 && data.blocked) {
    return { ok: false, blocked: true, message: data.message || 'Publish blocked by a security check.' };
  }
  if (!res.ok || !data.publishedUrl) {
    return { ok: false, blocked: false, error: data.error || `Publish failed (${res.status})` };
  }
  return { ok: true, publishedUrl: data.publishedUrl, subdomain: data.subdomain ?? '' };
}

/** Permanently delete the signed-in user's account and all their data. */
export async function deleteAccount(): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/account/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Delete failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

/** Take a published web project offline. */
export async function unpublishProject(projectId: string): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/publish`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Unpublish failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

// ── Plan Mode (mirrors the web app's plan-before-build) ────────────────────
export type PlanFeature = { id: string; title: string; description: string; icon: string };
export type PlanScreen = { id: string; name: string; icon: string };
export type Plan = {
  title: string;
  complexity: string;
  estimatedCredits: number;
  approach: string;
  features: PlanFeature[];
  flow: { screens: PlanScreen[] };
  integrations: string[];
  warnings: string[];
  creditsCharged?: number;
};

/**
 * Ask the server for a structured plan (features + screen flow) before building.
 * Same route + cost as the web "Show me a plan" step (5 credits). 402 → surface
 * a clear out-of-credits message so the user can just build instead.
 */
export async function planProject(prompt: string, projectType: ProjectType): Promise<Plan> {
  const token = await withTimeout(accessToken(), 15_000, 'Sign-in check');
  const res = await fetch(`${API_BASE}/api/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt, framework: 'react-vite', fileContext: '', phase: 'plan', projectType }),
  });
  const data = (await res.json().catch(() => ({}))) as Plan & { error?: string };
  if (res.status === 402) throw new Error('Not enough credits to plan (5 credits). Top up, or just build.');
  if (!res.ok || !data.title) throw new Error(data.error || `Couldn't build a plan (${res.status}).`);
  return data;
}

/** Flatten an approved plan into a build prompt the generator can act on. */
export function planToSpec(plan: Plan, originalPrompt: string): string {
  const feats = plan.features.map((f, i) => `${i + 1}. ${f.title} — ${f.description}`).join('\n');
  const flow = plan.flow.screens.map((s) => s.name).join(' → ');
  return [
    `Build this app: ${plan.title}`,
    plan.approach,
    '',
    'FEATURES (implement all):',
    feats,
    flow ? `\nSCREEN FLOW: ${flow}` : '',
    plan.integrations.length ? `\nINTEGRATIONS: ${plan.integrations.join(', ')}` : '',
    `\n(User's original request: ${originalPrompt})`,
  ]
    .filter(Boolean)
    .join('\n');
}

export type GenerateHandle = { abort: () => void };

/**
 * Stream a build/edit from /api/generate. React Native's fetch can't read a
 * response body incrementally, so this uses XMLHttpRequest — `onprogress` fires
 * as bytes arrive and `responseText` holds everything received so far.
 */
export function streamGenerate(
  params: {
    prompt: string;
    projectId: string;
    userId: string;
    projectType: ProjectType;
    files: FileMap;
    history?: { role: string; content: string }[];
  },
  handlers: {
    onText: (fullText: string) => void;
    onDone: (fullText: string) => void;
    onError: (message: string) => void;
  },
): GenerateHandle {
  const fileContext = toFileContext(params.files);
  const isFirstBuild = Object.keys(params.files || {}).length === 0;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_BASE}/api/generate`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  // ~6 min ceiling. If the connection stalls, ontimeout fires onError → the
  // caller resets its busy flag. (Was 820s, long enough to look permanently
  // frozen.)
  xhr.timeout = 360_000;

  // CRITICAL: the token fetch must never strand the UI. Previously every handler
  // wiring + xhr.send() lived inside accessToken().then(...) with no catch/
  // timeout — if getSession() hung or rejected, nothing fired, onDone/onError
  // never ran, and the caller's `busy` spinner locked forever (the "frozen
  // builder"). withTimeout + .catch guarantees onError always runs, so busy
  // always resets.
  let aborted = false;
  withTimeout(accessToken(), 15_000, 'Sign-in check')
    .then((token) => {
      if (aborted) return;
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onprogress = () => handlers.onText(xhr.responseText);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) handlers.onDone(xhr.responseText);
        else handlers.onError(`Build failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`);
      };
      xhr.onerror = () => handlers.onError('Network error during build');
      xhr.ontimeout = () => handlers.onError('Build timed out — check your connection and try again.');

      xhr.send(
        JSON.stringify({
          prompt: params.prompt,
          framework: 'react-vite',
          fileContext,
          history: params.history ?? [],
          userId: params.userId,
          projectId: params.projectId,
          projectType: params.projectType,
          isFirstBuild,
          stage: 'full',
        }),
      );
    })
    .catch((err: unknown) => {
      if (aborted) return;
      handlers.onError(err instanceof Error ? err.message : 'Could not start the build. Please try again.');
    });

  return {
    abort: () => {
      aborted = true;
      try { xhr.abort(); } catch { /* already done */ }
    },
  };
}

/**
 * Merge a completed generation's output into the existing file map: full <file>
 * blocks overwrite, <edit> blocks are applied as search/replace. Returns the new
 * map plus the assistant's chat text. Mirrors the web ChatPanel apply step.
 */
export function applyGeneration(
  existing: FileMap,
  fullText: string,
): { files: FileMap; chatText: string; changed: string[] } {
  const next: FileMap = { ...existing };
  const changed: string[] = [];

  const { files, chatText } = parseGenerationOutput(fullText);
  for (const f of files) {
    next[f.path] = { content: f.content, language: guessLang(f.path) };
    changed.push(f.path);
  }

  if (hasEditBlocks(fullText)) {
    const edited = applyEdits(next, parseEditBlocks(fullText));
    changed.push(...edited);
  }

  return { files: next, chatText, changed };
}

// ── Persistent chat history (mirrors the web ChatPanel's /api/projects/messages) ──
export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  filesChanged: string[];
};

/** Load the project's full chat history (oldest first). [] on any failure. */
export async function loadMessages(projectId: string): Promise<StoredMessage[]> {
  try {
    const token = await accessToken();
    const res = await fetch(`${API_BASE}/api/projects/messages?projectId=${projectId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: StoredMessage[] };
    return res.ok ? (data.messages ?? []) : [];
  } catch {
    return [];
  }
}

/**
 * Persist one chat message. Fire-and-forget from the caller's perspective —
 * chat must keep working even if history writes fail.
 */
export async function saveMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: string,
  opts: { filesChanged?: string[]; clientId?: string } = {},
): Promise<void> {
  try {
    const token = await accessToken();
    await fetch(`${API_BASE}/api/projects/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        projectId,
        role,
        content,
        filesChanged: opts.filesChanged ?? [],
        clientId: opts.clientId ?? null,
      }),
    });
  } catch {
    /* history is best-effort */
  }
}

// ── Version history (mirrors the web /api/versions snapshots) ───────────────
export type Version = { id: string; label: string; created_at: string; files?: FileMap };

/** Newest-first snapshots for a project (max 20, same as web). */
export async function listVersions(projectId: string): Promise<Version[]> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/versions?projectId=${projectId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = (await res.json().catch(() => ({}))) as { versions?: Version[]; error?: string };
  if (!res.ok) throw new Error(data.error || `Couldn't load versions (${res.status})`);
  return data.versions ?? [];
}

/** Snapshot the current files. Best-effort — a failed snapshot never blocks a build. */
export async function saveVersion(projectId: string, files: FileMap, label: string): Promise<void> {
  try {
    const token = await accessToken();
    await fetch(`${API_BASE}/api/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ projectId, files, label: label.slice(0, 80) }),
    });
  } catch {
    /* snapshots are best-effort */
  }
}

// ── Community showcase (public challenge gallery) ───────────────────────────
export type GalleryEntry = {
  id: string;
  title: string;
  description: string | null;
  handle: string | null;
  live_url: string;
  thumbnail_url: string | null;
  vote_count: number;
  created_at: string;
};

/** This week's approved community gallery, ranked by upvotes. [] on failure. */
export async function fetchGallery(): Promise<GalleryEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/challenge/entries`);
    const data = (await res.json().catch(() => ({}))) as { entries?: GalleryEntry[] };
    return res.ok ? (data.entries ?? []) : [];
  } catch {
    return [];
  }
}

// ── "Today's ideas" (AI-personalized starter prompts) ───────────────────────
export type Suggestion = {
  title: string;
  prompt: string;
  category: string; // fixed server enum — map to an icon client-side
};

/**
 * Personalized app ideas for today (generated once per user per day server-side).
 * [] on any failure — callers fall back to the static STARTERS.
 */
export async function fetchSuggestions(): Promise<{ suggestions: Suggestion[]; generated: boolean }> {
  try {
    const token = await accessToken();
    if (!token) return { suggestions: [], generated: false };
    const res = await fetch(`${API_BASE}/api/suggestions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      suggestions?: Suggestion[];
      generated?: boolean;
    };
    if (!res.ok || !Array.isArray(data.suggestions)) return { suggestions: [], generated: false };
    return {
      suggestions: data.suggestions.filter((s) => s?.title && s?.prompt),
      generated: !!data.generated,
    };
  } catch {
    return { suggestions: [], generated: false };
  }
}

// ── Connectors / secrets vault ──────────────────────────────────────────────
// A connector "works" once its API key(s) live in the user's vault; the deploy
// step injects them as env vars (mirrors the web builder). Supabase/OAuth
// connectors are deferred — this covers the key-based ones.

/** Names already in the vault (UPPERCASE), for the "✓ Connected" state. */
export async function listSecretNames(): Promise<Set<string>> {
  try {
    const token = await accessToken();
    if (!token) return new Set();
    const res = await fetch(`${API_BASE}/api/secrets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { secrets?: { name: string }[] };
    if (!res.ok) return new Set();
    return new Set((data.secrets ?? []).map((s) => (s.name || '').toUpperCase()));
  } catch {
    return new Set();
  }
}

/** Save one secret (upsert by name). Throws on failure so the UI can surface it. */
export async function saveSecret(name: string, value: string): Promise<void> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/secrets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, value }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Couldn't save key (${res.status}): ${t.slice(0, 120)}`);
  }
}

// ── Referral program ─────────────────────────────────────────────────────
export type ReferralInfo = { code: string; count: number; creditsEarned: number };

/** The signed-in user's referral code + stats. The server lazily mints a code
 * on first call, so this always returns something usable. null on failure. */
export async function fetchReferral(): Promise<ReferralInfo | null> {
  try {
    const token = await accessToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/api/referral`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as Partial<ReferralInfo>;
    if (!res.ok || !data.code) return null;
    return { code: data.code, count: data.count ?? 0, creditsEarned: data.creditsEarned ?? 0 };
  } catch {
    return null;
  }
}

/** Shareable invite link — new user gets 20 credits, referrer gets 50 on signup. */
export function referralLink(code: string): string {
  return `${API_BASE}/signup?ref=${code}`;
}

// ── Project management (RLS-scoped, same as the web dashboard) ──────────────
export async function renameProject(projectId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ name: name.trim().slice(0, 60), updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw new Error(error.message);
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw new Error(error.message);
}

// ── Credit activity (purchases + spends, from the credit_usage audit table) ──
export type CreditEvent = {
  id: string;
  /** Signed delta: positive = credits added (purchase/grant/refund), negative = spent. */
  delta: number;
  reason: string;
  balanceAfter: number | null;
  createdAt: string;
};

/**
 * The user's recent credit activity, newest first. [] on any failure.
 * NOTE: credit_usage stores `amount` as a positive magnitude for BOTH spends
 * and grants — direction comes from credits_before → credits_after when both
 * exist, else from the reason prefix (topup/grant/refund/referral = credit-in).
 */
export async function fetchCreditHistory(limit = 30): Promise<CreditEvent[]> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data } = await supabase
      .from('credit_usage')
      .select('id,amount,reason,credits_before,credits_after,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((r: any) => {
      const magnitude = Math.abs(Number(r.amount ?? 0));
      let sign = -1;
      if (typeof r.credits_before === 'number' && typeof r.credits_after === 'number') {
        sign = r.credits_after >= r.credits_before ? 1 : -1;
      } else if (/^(topup|grant|refund|referral|bonus|welcome)/i.test(String(r.reason ?? ''))) {
        sign = 1;
      }
      return {
        id: String(r.id),
        delta: sign * magnitude,
        reason: String(r.reason ?? ''),
        balanceAfter: typeof r.credits_after === 'number' ? r.credits_after : null,
        createdAt: String(r.created_at),
      };
    });
  } catch {
    return [];
  }
}

function guessLang(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html')) return 'html';
  return 'plaintext';
}
