import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditCost, resolveBuildTier, largestAffordableSmallerBuild } from '../src/lib/credits.ts';
import { capPlannedFiles, STAGE_THRESHOLD } from '../src/lib/staged-plan.ts';
import {
  normalizeWhatsApp, isValidUpiId, applyGrowKit, removeGrowKit, readGrowConfig,
  isGrowKitInstalled, EMPTY_GROW_CONFIG,
} from '../src/lib/grow-kit.ts';

test('displayed prices match the server (30/50/80/120 builds, 4cr edit, 100cr scans)', () => {
  assert.equal(creditCost('web-build', 'fast', 'small'), 30);
  assert.equal(creditCost('web-build', 'fast', 'medium'), 50);
  assert.equal(creditCost('web-build', 'fast', 'large'), 80);
  assert.equal(creditCost('web-build', 'fast', 'xl'), 120);
  assert.equal(creditCost('small-edit', 'fast'), 4);
  assert.equal(creditCost('security-scan', 'fast'), 100);
});

test('build tier: one-shot by complexity, staged by file count', () => {
  assert.equal(resolveBuildTier({ isComplex: false }), 'small');
  assert.equal(resolveBuildTier({ isComplex: true }), 'large');
  assert.equal(resolveBuildTier({ totalPlannedFiles: 12 }), 'large');
  assert.equal(resolveBuildTier({ totalPlannedFiles: 25 }), 'xl');
});

test('credit wall offers the biggest smaller build the balance covers', () => {
  assert.deepEqual(largestAffordableSmallerBuild('web-build', 'large', 60)?.tier, 'medium');
  assert.equal(largestAffordableSmallerBuild('web-build', 'large', 20), null);
  assert.equal(largestAffordableSmallerBuild('web-build', 'small', 500), null);
});

test('simpler-version plan cap keeps entry files even when listed last', () => {
  const files = ['src/index.css', 'src/a.tsx', 'src/b.tsx', 'src/c.tsx', 'src/App.tsx'].map((path) => ({ path, purpose: 'x' }));
  const capped = capPlannedFiles(files, 3).map((f) => f.path);
  assert.equal(capped.length, 3);
  assert.ok(capped.includes('src/App.tsx') && capped.includes('src/index.css'));
});

test('builds run one-shot like web', () => {
  assert.equal(STAGE_THRESHOLD, 999);
});

test('grow kit: number and UPI validation', () => {
  assert.equal(normalizeWhatsApp('098765 43210'), '919876543210');
  assert.equal(normalizeWhatsApp('+44 7700 900123'), '447700900123');
  assert.ok(isValidUpiId('shop@okicici'));
  assert.ok(!isValidUpiId('shop okicici'));
});

test('grow kit installs and removes cleanly', () => {
  const files = {
    'index.html': { content: '<html><head></head><body><div id="root"></div></body></html>' },
    'src/main.tsx': { content: "import React from 'react';\nrender(<App />);\n" },
    'src/App.tsx': { content: 'export default function App(){return null}' },
  };
  const cfg = { ...EMPTY_GROW_CONFIG, businessName: 'Sri Shop', whatsapp: '9876543210', upiId: 'shop@okicici' };
  const on = applyGrowKit(files, cfg, { qrSvg: '<svg/>' });
  assert.ok(isGrowKitInstalled(on));
  assert.equal(readGrowConfig(on)?.whatsapp, '919876543210');
  assert.match((on['index.html'] as { content: string }).content, /application\/ld\+json/);
  const off = removeGrowKit(on);
  assert.ok(!isGrowKitInstalled(off));
  assert.equal((off['src/main.tsx'] as { content: string }).content, files['src/main.tsx'].content);
});
