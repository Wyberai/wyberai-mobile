import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GO_LIVE_SERVICES, planGoLive, serverEnvNames } from '../src/lib/go-live.ts';

// Ported from the web repo's go-live tests (minus the BYOS-only quote cases).
const api = (c: string) => ({ content: c });

test('catalog has unique service ids and unique setting names per service', () => {
  assert.equal(new Set(GO_LIVE_SERVICES.map((s) => s.id)).size, GO_LIVE_SERVICES.length);
  for (const s of GO_LIVE_SERVICES) assert.equal(new Set(s.vars.map((v) => v.name)).size, s.vars.length);
});

test('serverEnvNames reads only api/ functions, both access styles, ignoring platform vars', () => {
  const files = {
    'api/status.ts': api("export default (q,r)=>r.json({a: !!process.env.TWILIO_AUTH_TOKEN, b: process.env['AWS_REGION'], n: process.env.NODE_ENV, v: process.env.VERCEL_URL, m: process.env.ANTHROPIC_MODEL})"),
    'src/App.tsx': api('const x = process.env.SHOULD_NOT_APPEAR'),
    '/api/ai.js': api('process.env.ANTHROPIC_API_KEY'),
  };
  assert.deepEqual(serverEnvNames(files), ['TWILIO_AUTH_TOKEN', 'AWS_REGION', 'ANTHROPIC_API_KEY']);
});

test('planGoLive lists what is missing and what is connected', () => {
  const files = {
    'api/ses.ts': api('process.env.AWS_ACCESS_KEY_ID; process.env.AWS_SECRET_ACCESS_KEY; process.env.AWS_REGION; process.env.SES_FROM_EMAIL'),
    'api/ai.ts': api('process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY'),
    'api/x.ts': api('process.env.MY_CUSTOM_HOOK'),
  };
  const p = planGoLive(files, new Set(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'OPENAI_API_KEY']));
  const ses = p.items.find((i) => i.service.id === 'ses')!;
  assert.equal(ses.connected, false);
  assert.deepEqual(ses.missing.map((v) => v.name), ['AWS_REGION', 'SES_FROM_EMAIL']);
  assert.equal(p.items.find((i) => i.service.id === 'ai')!.connected, true);
  assert.deepEqual(p.other, ['MY_CUSTOM_HOOK']);
  assert.equal(p.serverFiles, 3);
});

test('planGoLive is empty for an app with no server code', () => {
  assert.deepEqual(planGoLive({ 'src/App.tsx': api('x') }, new Set()), { items: [], other: [], serverFiles: 0 });
});
