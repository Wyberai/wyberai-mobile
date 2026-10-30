import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BANNED_COPY } from './copy-rules.ts';

// Customer-facing chat copy must not narrate internal failures, blame the
// user's network, or admit untested work (same rules as web's copy guard).
const ROOT = join(import.meta.dirname, '..');
const dictDir = join(ROOT, 'src/lib/i18n/dict');
const files = [
  join(ROOT, 'src/app/(app)/build/[id].tsx'),
  ...readdirSync(dictDir).filter((f) => f.endsWith('.ts')).map((f) => join(dictDir, f)),
];

test('chat and dictionary string literals follow the copy rules', () => {
  const bad: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(['"`])((?:\.|(?!\1)[^\\n])+)\1/g)) {
      for (const [re, why] of BANNED_COPY) if (re.test(m[2])) bad.push(`${why}: "${m[2].slice(0, 80)}" in ${file}`);
    }
  }
  assert.deepEqual(bad, []);
});
