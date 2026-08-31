/**
 * detect-deps.ts
 *
 * Ported verbatim from the web app (src/lib/detect-deps.ts).
 *
 * Client-side keyword scan: given a user prompt, return which external
 * services the app is likely to need so the chat can ask for keys BEFORE
 * coding starts.
 *
 * Rules:
 *  - Only fires on new-build prompts (no existing files).
 *  - Never hard-blocks: every dep has a "skip" path in the UI.
 */

export interface DetectedDeps {
  needsSupabase: boolean
  needsStripe: boolean
  needsOpenAI: boolean
  needsSendgrid: boolean
  needsResend: boolean
  /** Names of Composio-connected tools detected (e.g. ['GitHub', 'Slack']) */
  composioTools: string[]
  /** True if ANY external dep was detected */
  hasAnyDep: boolean
}

export interface RegulatedDomain {
  /** Short label shown in the UI notice, e.g. 'health / PHI' */
  label: string
  /** One-line compliance requirement shown to the user */
  requirement: string
}

// ── Regulated-domain keyword banks ────────────────────────────────────────────

const HEALTH_KEYWORDS = [
  'patient', 'ehr', 'emr', 'medical record', 'health record', 'phi',
  'hipaa', 'diagnosis', 'prescription', 'clinical', 'physician', 'nurse',
  'hospital', 'clinic', 'healthcare', 'telemedicine', 'telehealth',
  'lab result', 'blood test', 'insurance claim', 'medical history',
  'medication', 'treatment plan', 'intake form', 'symptom', 'vitals',
  'radiology', 'pathology', 'icd code', 'fhir', 'hl7',
]

const FINANCIAL_PII_KEYWORDS = [
  'ssn', 'social security number', 'tax return', 'tax id', 'ein',
  'bank account number', 'routing number', 'credit card number', 'cvv',
  'cardholder', 'pci', 'wire transfer', 'ach transfer',
  'financial record', 'tax document', 'w-2', '1099', 'w2 form',
]

const GOVT_ID_KEYWORDS = [
  'passport number', 'driver license number', 'driving license', 'state id',
  'government id', 'national id', 'birth certificate',
  'social security card', 'immigration record', 'visa application',
  'background check', 'identity verification', 'kyc', 'know your customer',
]

/**
 * Scan a prompt for regulated/sensitive domain signals.
 * Returns an array of detected domains (empty = none).
 * Never hard-blocks — callers must show a non-blocking notice.
 */
export function detectRegulated(prompt: string): RegulatedDomain[] {
  const p = prompt.toLowerCase()
  const domains: RegulatedDomain[] = []

  if (HEALTH_KEYWORDS.some(kw => p.includes(kw))) {
    domains.push({
      label: 'health / PHI',
      requirement: 'HIPAA-eligible infrastructure with a signed BAA (Business Associate Agreement)',
    })
  }
  if (FINANCIAL_PII_KEYWORDS.some(kw => p.includes(kw))) {
    domains.push({
      label: 'financial PII',
      requirement: 'PCI-DSS compliant storage and transmission controls',
    })
  }
  if (GOVT_ID_KEYWORDS.some(kw => p.includes(kw))) {
    domains.push({
      label: 'government / identity data',
      requirement: 'privacy-law-compliant storage (varies by jurisdiction)',
    })
  }

  return domains
}

// ── keyword banks ─────────────────────────────────────────────────────────────

const SUPABASE_KEYWORDS = [
  'login', 'sign in', 'sign up', 'signup', 'register', 'auth',
  'authentication', 'user account', 'user profile', 'profiles',
  'database', 'backend', 'persist', 'store data', 'save data',
  'real-time', 'realtime', 'live updates', 'supabase',
  'multi-user', 'multiuser', 'per user', 'users can',
]

const STRIPE_KEYWORDS = [
  'payment', 'payments', 'checkout', 'subscribe', 'subscription',
  'billing', 'charge', 'stripe', 'credit card', 'buy', 'purchase',
  'paid plan', 'pricing tier', 'monetize',
]

const OPENAI_KEYWORDS = [
  'openai', 'gpt', 'chatgpt', 'ai chat', 'ai-generated', 'llm', 'completion',
  'embeddings', 'assistant api', 'dall-e', 'whisper transcription',
]

const SENDGRID_KEYWORDS = ['sendgrid']

const RESEND_KEYWORDS = ['resend', 'transactional email', 'send an email', 'email notification', 'email confirmation']

// Map of tool name → keywords that suggest it's needed
const COMPOSIO_TOOL_KEYWORDS: Record<string, string[]> = {
  GitHub:   ['github', 'repo', 'pull request', 'commit', 'issues', 'git'],
  Slack:    ['slack', 'channel message', 'send a slack', 'notify slack'],
  Gmail:    ['gmail', 'send email', 'email draft', 'email notification'],
  Notion:   ['notion', 'notion page', 'notion database'],
  HubSpot:  ['hubspot', 'crm contact', 'hubspot deal'],
  Google:   ['google sheets', 'google calendar', 'google drive', 'google docs'],
  Jira:     ['jira', 'jira ticket', 'jira issue'],
  Linear:   ['linear', 'linear issue', 'linear ticket'],
}

function matches(prompt: string, keywords: string[]): boolean {
  const p = prompt.toLowerCase()
  return keywords.some(kw => p.includes(kw))
}

export function detectDeps(prompt: string): DetectedDeps {
  const needsSupabase = matches(prompt, SUPABASE_KEYWORDS)
  const needsStripe   = matches(prompt, STRIPE_KEYWORDS)
  const needsOpenAI   = matches(prompt, OPENAI_KEYWORDS)
  const needsSendgrid = matches(prompt, SENDGRID_KEYWORDS)
  const needsResend   = matches(prompt, RESEND_KEYWORDS)

  const composioTools: string[] = []
  for (const [tool, kws] of Object.entries(COMPOSIO_TOOL_KEYWORDS)) {
    if (matches(prompt, kws)) composioTools.push(tool)
  }

  return {
    needsSupabase,
    needsStripe,
    needsOpenAI,
    needsSendgrid,
    needsResend,
    composioTools,
    hasAnyDep: needsSupabase || needsStripe || needsOpenAI || needsSendgrid || needsResend || composioTools.length > 0,
  }
}
