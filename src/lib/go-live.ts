// Ported verbatim from the web repo's src/lib/go-live.ts (pure logic). The BYOS-only
// KIND_TO_SERVICES / settingsForNeeds helpers are omitted: they feed the web
// builder prompt and mobile has no BYOS quote flow.

/**
 * What an owner has to fill in before an app's server features work, and how to
 * find out from the app's own code which of those it actually reads. The same
 * catalog tells the builder the exact setting names to use, so the checklist in
 * the editor and the generated `api/` functions always agree.
 */
export interface GoLiveVar { name: string; label: string; secret: boolean; placeholder?: string }

export interface GoLiveService {
  id: string
  label: string
  keyUrl: string
  /** One line on where in the provider's dashboard the value lives. */
  where: string
  vars: GoLiveVar[]
  /** True when any one of the vars is enough (OpenAI OR Anthropic). */
  oneOf?: boolean
}

export const GO_LIVE_SERVICES: GoLiveService[] = [
  {
    id: 'ses', label: 'Amazon SES', keyUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    where: 'AWS console, Security credentials, Create access key. The sender address must be verified in SES.',
    vars: [
      { name: 'AWS_ACCESS_KEY_ID', label: 'Access key ID', secret: false, placeholder: 'AKIA…' },
      { name: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key', secret: true },
      { name: 'AWS_REGION', label: 'Region', secret: false, placeholder: 'us-east-1' },
      { name: 'SES_FROM_EMAIL', label: 'Verified sender address', secret: false, placeholder: 'hello@yourdomain.com' },
    ],
  },
  {
    id: 'resend', label: 'Resend', keyUrl: 'https://resend.com/api-keys',
    where: 'Resend dashboard, API Keys. Verify your sending domain first.',
    vars: [
      { name: 'RESEND_API_KEY', label: 'API key', secret: true, placeholder: 're_…' },
      { name: 'RESEND_FROM_EMAIL', label: 'Sender address', secret: false, placeholder: 'hello@yourdomain.com' },
    ],
  },
  {
    id: 'twilio', label: 'Twilio', keyUrl: 'https://console.twilio.com',
    where: 'Twilio console home shows the Account SID and Auth Token. The sender is your WhatsApp or SMS number.',
    vars: [
      { name: 'TWILIO_ACCOUNT_SID', label: 'Account SID', secret: false, placeholder: 'AC…' },
      { name: 'TWILIO_AUTH_TOKEN', label: 'Auth token', secret: true },
      { name: 'TWILIO_WHATSAPP_FROM', label: 'Sender number', secret: false, placeholder: '+14155238886' },
    ],
  },
  {
    id: 'ai', label: 'AI model (your own key)', keyUrl: 'https://console.anthropic.com/settings/keys',
    where: 'Anthropic Console, API keys, or platform.openai.com/api-keys. One of the two is enough. Set a spending limit there.',
    oneOf: true,
    vars: [
      { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', secret: true, placeholder: 'sk-ant-…' },
      { name: 'OPENAI_API_KEY', label: 'OpenAI API key', secret: true, placeholder: 'sk-…' },
    ],
  },
  {
    id: 'stripe', label: 'Stripe', keyUrl: 'https://dashboard.stripe.com/apikeys',
    where: 'Stripe dashboard, Developers, API keys. Use the secret key, and a webhook signing secret if you take payments.',
    vars: [
      { name: 'STRIPE_SECRET_KEY', label: 'Secret key', secret: true, placeholder: 'sk_live_… or sk_test_…' },
      { name: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', secret: true, placeholder: 'whsec_…' },
    ],
  },
  {
    id: 'google', label: 'Google (Gmail and Calendar)', keyUrl: 'https://console.cloud.google.com/apis/credentials',
    where: 'Google Cloud console, APIs and Services, Credentials, OAuth client ID.',
    vars: [
      { name: 'GOOGLE_CLIENT_ID', label: 'OAuth client ID', secret: false },
      { name: 'GOOGLE_CLIENT_SECRET', label: 'OAuth client secret', secret: true },
    ],
  },
  {
    id: 'daily', label: 'Daily (video calls)', keyUrl: 'https://dashboard.daily.co/developers',
    where: 'Daily dashboard, Developers, API keys.',
    vars: [{ name: 'DAILY_API_KEY', label: 'API key', secret: true }],
  },
  {
    id: 'mux', label: 'Mux (video hosting)', keyUrl: 'https://dashboard.mux.com/settings/access-tokens',
    where: 'Mux dashboard, Settings, Access tokens.',
    vars: [
      { name: 'MUX_TOKEN_ID', label: 'Token ID', secret: false },
      { name: 'MUX_TOKEN_SECRET', label: 'Token secret', secret: true },
    ],
  },
  {
    id: 'deepgram', label: 'Deepgram (transcription)', keyUrl: 'https://console.deepgram.com',
    where: 'Deepgram console, API keys.',
    vars: [{ name: 'DEEPGRAM_API_KEY', label: 'API key', secret: true }],
  },
  {
    id: 'workos', label: 'WorkOS (company sign-in)', keyUrl: 'https://dashboard.workos.com/api-keys',
    where: 'WorkOS dashboard, API keys.',
    vars: [
      { name: 'WORKOS_API_KEY', label: 'API key', secret: true },
      { name: 'WORKOS_CLIENT_ID', label: 'Client ID', secret: false },
    ],
  },
  {
    id: 'maps', label: 'Google Maps', keyUrl: 'https://console.cloud.google.com/google/maps-apis/credentials',
    where: 'Google Cloud console, Maps Platform, Credentials. Restrict the key to your domain.',
    vars: [{ name: 'GOOGLE_MAPS_API_KEY', label: 'API key', secret: true }],
  },
]

type FileMap = Record<string, { content?: string } | string>

const IGNORED = /^(NODE_ENV|VERCEL.*|PORT|CI|TZ|.*_MODEL)$/
const ENV_REF = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g

/** Setting names the app's server functions (api/) read, in first-seen order. */
export function serverEnvNames(files: FileMap): string[] {
  const out: string[] = []
  for (const [path, f] of Object.entries(files)) {
    if (!/^\/?api\//.test(path) || !/\.(ts|js|mjs|cjs)$/.test(path)) continue
    const src = typeof f === 'string' ? f : f?.content ?? ''
    for (const m of src.matchAll(ENV_REF)) {
      const name = m[1] ?? m[2]
      if (name && !IGNORED.test(name) && !out.includes(name)) out.push(name)
    }
  }
  return out
}

export interface GoLiveItem {
  service: GoLiveService
  /** Vars this service still needs, given what is already saved. */
  missing: GoLiveVar[]
  connected: boolean
}

export interface GoLivePlan {
  items: GoLiveItem[]
  /** Setting names the code reads that match no known service. */
  other: string[]
  serverFiles: number
}

/** What the owner still has to enter, worked out from the app's own code. */
export function planGoLive(files: FileMap, saved: Set<string>): GoLivePlan {
  const names = serverEnvNames(files)
  const used = new Set(names)
  const claimed = new Set<string>()
  const items: GoLiveItem[] = []
  for (const service of GO_LIVE_SERVICES) {
    const relevant = service.vars.filter(v => used.has(v.name))
    if (!relevant.length) continue
    relevant.forEach(v => claimed.add(v.name))
    const have = (v: GoLiveVar) => saved.has(v.name)
    const connected = service.oneOf ? service.vars.some(have) : service.vars.filter(v => used.has(v.name)).every(have)
    const missing = connected ? [] : (service.oneOf ? service.vars : relevant).filter(v => !have(v))
    items.push({ service, missing, connected })
  }
  const serverFiles = Object.keys(files).filter(p => /^\/?api\//.test(p)).length
  return { items, other: names.filter(n => !claimed.has(n)), serverFiles }
}
