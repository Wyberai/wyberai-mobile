import { loadProjectFiles, saveFiles, saveVersion, type FileMap } from './api';

// Shared "Apply all fixes" for the Security Beast and SEO & Marketing Beast
// screens (web: components/editor/applyBeastFixes.ts). Two things in one tap:
// mechanically-generated fixes (report.fixedFiles) are written straight into the
// project after a Version History snapshot, and whatever is left over (checks
// that need real code judgment) is bundled into ONE builder prompt.

const LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  css: 'css', html: 'html', json: 'json', xml: 'xml', txt: 'plaintext',
};

export type BeastLikeReport = {
  checks: { id: string; status: 'pass' | 'warn' | 'fail' }[];
  fixedFiles?: Record<string, string>;
  fixedCheckIds?: string[];
};

export async function applyBeastFixesToProject(opts: {
  projectId: string;
  report: BeastLikeReport;
  snapshotLabel: string;
  promptFor: (checkId: string) => string | undefined;
}): Promise<{ filesWritten: number; remainingPrompt: string | null }> {
  const { projectId, report, snapshotLabel, promptFor } = opts;
  const fixedFiles = report.fixedFiles ?? {};
  const fixedIds = new Set(report.fixedCheckIds ?? []);
  const paths = Object.keys(fixedFiles);

  if (paths.length > 0) {
    const current = await loadProjectFiles(projectId);
    await saveVersion(projectId, current, snapshotLabel);
    const next: FileMap = { ...current };
    for (const p of paths) {
      const ext = p.split('.').pop() ?? '';
      next[p] = { content: fixedFiles[p], language: current[p]?.language ?? LANG[ext] ?? 'plaintext' };
    }
    await saveFiles(projectId, next);
  }

  const lines = report.checks
    .filter((c) => c.status !== 'pass' && !fixedIds.has(c.id))
    .map((c) => promptFor(c.id))
    .filter((p): p is string => !!p);

  const remainingPrompt = lines.length
    ? `Fix the following issues found by a scan. Match this app's existing design system, code style, and framework conventions.\n\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
    : null;
  return { filesWritten: paths.length, remainingPrompt };
}
