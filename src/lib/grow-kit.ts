// Grow kit — the "get customers" layer for a built app, at 0 credits.
//
// Deterministic file writes, no LLM (same contract as theme-apply.ts):
//   src/wyber-grow/config.ts       the owner's details, parsed back on reopen
//   src/wyber-grow/GrowWidgets.tsx floating WhatsApp + UPI pay buttons
//   src/wyber-grow/mount.tsx       renders the widgets into their own root
//   main entry                     + one `import './wyber-grow/mount'` line
//   index.html                     + LocalBusiness JSON-LD between markers
//
// The widgets mount beside <App />, never inside it, so nothing the model
// wrote is touched and a later AI edit can't break them (or vice versa).
// UPI QR is pre-rendered to an SVG string by the editor at apply time, so
// the app gets a scannable code without a runtime QR dependency.

export interface GrowConfig {
  businessName: string;
  /** Digits only after normalizeWhatsApp — country code included. */
  whatsapp: string;
  whatsappMessage: string;
  upiId: string;
  upiName: string;
  phone: string;
  address: string;
  city: string;
  hours: string;
  showWhatsApp: boolean;
  showUpi: boolean;
}

export const EMPTY_GROW_CONFIG: GrowConfig = {
  businessName: '', whatsapp: '', whatsappMessage: 'Hi! I found you through your website.',
  upiId: '', upiName: '', phone: '', address: '', city: '', hours: '',
  showWhatsApp: true, showUpi: true,
};

export const GROW_DIR = 'src/wyber-grow';
const CONFIG_PATH = `${GROW_DIR}/config.ts`;
const MOUNT_IMPORT = `import './wyber-grow/mount';`;
const HTML_START = '<!-- wyber-grow:start -->';
const HTML_END = '<!-- wyber-grow:end -->';
const ENTRY_CANDIDATES = ['src/main.tsx', 'src/main.jsx', 'src/index.tsx', 'src/index.jsx'];

type FileMap = Record<string, unknown>;

const contentOf = (v: unknown): string =>
  typeof v === 'string' ? v : ((v as { content?: string } | undefined)?.content ?? '');

const withContent = (prev: unknown, path: string, content: string, language: string) =>
  prev && typeof prev === 'object' ? { ...(prev as object), content } : { path, content, language };

/** 10-digit Indian mobiles get +91; anything else must already carry its
 *  country code (the panel says so). Returns digits only. */
export function normalizeWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  return digits;
}

export function isValidUpiId(id: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(id.trim());
}

export function whatsAppLink(number: string, message?: string): string {
  const n = normalizeWhatsApp(number);
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

export function upiLink(upiId: string, payeeName: string): string {
  const params = new URLSearchParams({ pa: upiId.trim(), pn: payeeName.trim() || upiId.trim(), cu: 'INR' });
  return `upi://pay?${params.toString()}`;
}

/** Which widgets would actually render — a toggle is only live with valid data. */
export function activeWidgets(c: GrowConfig): { whatsapp: boolean; upi: boolean } {
  return {
    whatsapp: c.showWhatsApp && normalizeWhatsApp(c.whatsapp).length >= 8,
    upi: c.showUpi && isValidUpiId(c.upiId),
  };
}

export function findEntry(files: FileMap): string | undefined {
  return ENTRY_CANDIDATES.find(p => p in files);
}

/** Web (Vite) apps only — a React Native project has no index.html/entry. */
export function canApplyGrowKit(files: FileMap): boolean {
  return 'index.html' in files && !!findEntry(files);
}

export function isGrowKitInstalled(files: FileMap): boolean {
  return CONFIG_PATH in files || Object.keys(files).some(p => p.startsWith(`${GROW_DIR}/config.`));
}

export function readGrowConfig(files: FileMap): GrowConfig | null {
  const path = Object.keys(files).find(p => p.startsWith(`${GROW_DIR}/config.`));
  if (!path) return null;
  const m = contentOf(files[path]).match(/GROW_CONFIG\s*=\s*(\{[\s\S]*\});?/);
  if (!m) return null;
  try {
    return { ...EMPTY_GROW_CONFIG, ...JSON.parse(m[1]) };
  } catch {
    return null;
  }
}

/** schema.org LocalBusiness — what Google/AI search read for name, phone,
 *  address and hours. `</` is escaped so the JSON can't close the script. */
export function buildLocalBusinessJsonLd(c: GrowConfig, siteUrl?: string): string {
  const phone = c.phone.trim() || (c.whatsapp ? `+${normalizeWhatsApp(c.whatsapp)}` : '');
  const ld: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: c.businessName.trim() };
  if (siteUrl) ld.url = siteUrl;
  if (phone) ld.telephone = phone;
  if (c.address.trim() || c.city.trim()) {
    ld.address = {
      '@type': 'PostalAddress',
      ...(c.address.trim() ? { streetAddress: c.address.trim() } : {}),
      ...(c.city.trim() ? { addressLocality: c.city.trim() } : {}),
      addressCountry: normalizeWhatsApp(c.whatsapp).startsWith('91') || !c.whatsapp ? 'IN' : undefined,
    };
  }
  if (c.hours.trim()) ld.openingHours = c.hours.trim();
  if (activeWidgets(c).whatsapp) ld.sameAs = [whatsAppLink(c.whatsapp)];
  return JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
}

function patchIndexHtml(html: string, block: string | null): string {
  const re = new RegExp(`\\s*${HTML_START}[\\s\\S]*?${HTML_END}`, 'g');
  const stripped = html.replace(re, '');
  if (!block) return stripped;
  const insert = `    ${HTML_START}\n${block}\n    ${HTML_END}\n`;
  return /<\/head>/i.test(stripped)
    ? stripped.replace(/[ \t]*<\/head>/i, `${insert}  </head>`)
    : `${insert}${stripped}`;
}

function patchEntry(src: string, install: boolean): string {
  const without = src.split('\n').filter(l => l.trim() !== MOUNT_IMPORT).join('\n');
  return install ? `${without.replace(/\s*$/, '')}\n${MOUNT_IMPORT}\n` : without;
}

function widgetsSource(qrSvg: string): string {
  return `// Generated by WyberAi Grow kit — edit your details in the Grow panel, not here.
import { useState } from 'react';
import { GROW_CONFIG as c } from './config';

const UPI_QR = ${JSON.stringify(qrSvg)};

const digits = c.whatsapp.replace(/\\D/g, '');
const waHref = 'https://wa.me/' + digits + (c.whatsappMessage ? '?text=' + encodeURIComponent(c.whatsappMessage) : '');
const upiHref = 'upi://pay?' + new URLSearchParams({ pa: c.upiId, pn: c.upiName || c.businessName || c.upiId, cu: 'INR' }).toString();
const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const fab = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 999,
  border: 'none', cursor: 'pointer', font: '600 14px/1 system-ui, sans-serif', textDecoration: 'none',
  boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
} as const;

export default function GrowWidgets() {
  const [payOpen, setPayOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const showWa = c.showWhatsApp && digits.length >= 8;
  const showUpi = c.showUpi && !!c.upiId;
  if (!showWa && !showUpi) return null;

  const onPay = () => { if (isPhone) window.location.href = upiHref; else setPayOpen(true); };
  const copy = () => { navigator.clipboard?.writeText(c.upiId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  return (
    <>
      <div style={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 2147483000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        {showUpi && (
          <button type="button" onClick={onPay} aria-label="Pay with UPI"
            style={{ ...fab, background: 'hsl(var(--primary, 222 47% 11%))', color: 'hsl(var(--primary-foreground, 0 0% 100%))' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Pay with UPI
          </button>
        )}
        {showWa && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"
            style={{ ...fab, background: '#25D366', color: '#fff' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z"/></svg>
            WhatsApp us
          </a>
        )}
      </div>

      {payOpen && (
        <div role="dialog" aria-modal="true" aria-label="Pay with UPI" onClick={() => setPayOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', color: '#111', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, textAlign: 'center', font: '14px/1.4 system-ui, sans-serif' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{c.upiName || c.businessName}</div>
            <div style={{ color: '#555', marginBottom: 14 }}>Scan with any UPI app</div>
            <div style={{ width: 200, height: 200, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: UPI_QR }} />
            <button type="button" onClick={copy}
              style={{ marginTop: 14, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#f6f6f6', cursor: 'pointer', font: 'inherit' }}>
              {copied ? 'Copied' : c.upiId}
            </button>
            <div><button type="button" onClick={() => setPayOpen(false)}
              style={{ marginTop: 12, border: 'none', background: 'none', color: '#555', cursor: 'pointer', font: 'inherit' }}>Close</button></div>
          </div>
        </div>
      )}
    </>
  );
}
`;
}

const MOUNT_SOURCE = `// Generated by WyberAi Grow kit — renders beside <App />, never inside it.
import { createRoot } from 'react-dom/client';
import GrowWidgets from './GrowWidgets';

if (typeof document !== 'undefined' && !document.getElementById('wyber-grow-root')) {
  const host = document.createElement('div');
  host.id = 'wyber-grow-root';
  document.body.appendChild(host);
  createRoot(host).render(<GrowWidgets />);
}
`;

/** Install or update the kit. `qrSvg` is the UPI QR as an SVG string
 *  (empty when UPI is off). Returns a new file map; input is not mutated. */
export function applyGrowKit(files: FileMap, config: GrowConfig, opts: { qrSvg: string; siteUrl?: string }): FileMap {
  const entry = findEntry(files);
  if (!entry || !('index.html' in files)) throw new Error('Grow kit needs a web app with index.html and a main entry');
  const ext = entry.endsWith('.jsx') ? 'jsx' : 'tsx';
  const lang = ext === 'tsx' ? 'typescript' : 'javascript';
  const cfgExt = ext === 'tsx' ? 'ts' : 'js';
  const clean: GrowConfig = { ...config, whatsapp: normalizeWhatsApp(config.whatsapp), upiId: config.upiId.trim() };

  const out: FileMap = { ...files };
  for (const p of Object.keys(out)) if (p.startsWith(`${GROW_DIR}/`)) delete out[p];

  const cfgPath = `${GROW_DIR}/config.${cfgExt}`;
  out[cfgPath] = { path: cfgPath, language: lang, content: `// Generated by WyberAi Grow kit — edit in the Grow panel.\nexport const GROW_CONFIG = ${JSON.stringify(clean, null, 2)};\n` };
  const widgetsPath = `${GROW_DIR}/GrowWidgets.${ext}`;
  let widgets = widgetsSource(clean.showUpi ? opts.qrSvg : '');
  if (ext === 'jsx') widgets = widgets.replace(/ as const;/g, ';');
  out[widgetsPath] = { path: widgetsPath, language: lang, content: widgets };
  const mountPath = `${GROW_DIR}/mount.${ext}`;
  out[mountPath] = { path: mountPath, language: lang, content: MOUNT_SOURCE };

  out[entry] = withContent(files[entry], entry, patchEntry(contentOf(files[entry]), true), lang);

  const ld = clean.businessName.trim()
    ? `    <script type="application/ld+json">\n${buildLocalBusinessJsonLd(clean, opts.siteUrl)}\n    </script>`
    : null;
  out['index.html'] = withContent(files['index.html'], 'index.html', patchIndexHtml(contentOf(files['index.html']), ld), 'html');
  return out;
}

/** Fully remove the kit — files, entry import and JSON-LD block. */
export function removeGrowKit(files: FileMap): FileMap {
  const out: FileMap = { ...files };
  for (const p of Object.keys(out)) if (p.startsWith(`${GROW_DIR}/`)) delete out[p];
  const entry = findEntry(out);
  if (entry) {
    const lang = entry.endsWith('.jsx') ? 'javascript' : 'typescript';
    out[entry] = withContent(out[entry], entry, patchEntry(contentOf(out[entry]), false), lang);
  }
  if ('index.html' in out) out['index.html'] = withContent(out['index.html'], 'index.html', patchIndexHtml(contentOf(out['index.html']), null), 'html');
  return out;
}
