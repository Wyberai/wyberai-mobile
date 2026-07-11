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

export type ProjectType = 'web' | 'mobile';
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
        framework: 'react-vite',
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
  return data.id as string;
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
 * Build an in-app mobile (react-native-web) preview and return an HTML document
 * to load directly in the WebView. This renders the generated RN app INSIDE
 * WyberAi — the Expo Go / Snack replacement. Returns the HTML string.
 */
export async function buildMobilePreviewHtml(projectId: string, files: FileMap): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}/api/rn-web-bundle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ files, projectId }),
  });
  const data = (await res.json().catch(() => ({}))) as { html?: string; error?: string };
  if (!res.ok || !data.html) throw new Error(data.error || `Preview build failed (${res.status})`);
  return data.html;
}

/**
 * Build a web-app preview and return a loadable URL. Goes through wyberai.com's
 * /api/preview-build (NOT the raw preview-builder) so the files are sanitized
 * server-side first — same guaranteed entry/config the desktop editor adds.
 * Posting raw files straight to the builder produced an entry-less project that
 * never rendered ("Preview isn't ready yet").
 */
export async function buildPreview(projectId: string, files: FileMap): Promise<string> {
  const res = await fetch(`${API_BASE}/api/preview-build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, projectId }),
  });
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
  const res = await fetch(`${API_BASE}/api/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ projectId, override }),
  });
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

function guessLang(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.html')) return 'html';
  return 'plaintext';
}
