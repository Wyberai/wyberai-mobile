// Mobile's own preview-selection bridge — NOT a port of the web app's
// bridge.ts snippet. That script assumes it's running inside a browser
// iframe (window.parent !== window, hover via mousemove, communicates via
// window.parent.postMessage) — none of which holds for a React Native
// WebView, which loads the page as a top-level document (no window.parent),
// has no mouse/hover, and talks to the native side through
// window.ReactNativeWebView.postMessage outbound and a page-side listener on
// BOTH `document` (Android) and `window` (iOS) inbound, per RN WebView's
// documented platform difference. The message TYPES below intentionally
// match web's protocol (wyber-edit-mode / wyber-element-selected /
// wyber-set-class / wyber-set-text) so lib/visual-edit-apply.ts's pure
// functions and the mobile UI can share the same mental model — only the
// transport and the tap-vs-hover interaction are different.
//
// Requires data-wyber-loc="path:line" attributes already present on the HTML
// (see lib/wyber-preview-loc.ts injectWyberLoc, applied to a FILES COPY
// before the preview build — never persisted to the project).

export const WYBER_MOBILE_BRIDGE_SNIPPET = `/* wyber-select-bridge-mobile */(function(){
var selecting=false,selEl=null,box=null;
function ensureBox(){if(box)return box;box=document.createElement('div');box.setAttribute('style','position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #0EA5E9;background:rgba(14,165,233,0.12);border-radius:3px;display:none;');document.documentElement.appendChild(box);return box}
function place(el){try{var r=el.getBoundingClientRect();var b=ensureBox();b.style.display='block';b.style.left=r.left+'px';b.style.top=r.top+'px';b.style.width=r.width+'px';b.style.height=r.height+'px'}catch(e){}}
function hideBox(){if(box)box.style.display='none'}
function cssPath(el){try{var parts=[];var n=el;while(n&&n.nodeType===1&&parts.length<6){var s=n.tagName.toLowerCase();if(n.id){parts.unshift(s+'#'+n.id);break}var cls=(typeof n.className==='string'?n.className:'').trim().split(/\\s+/).filter(Boolean).slice(0,2);if(cls.length)s+='.'+cls.join('.');var p=n.parentElement;if(p){var sib=Array.prototype.filter.call(p.children,function(c){return c.tagName===n.tagName});if(sib.length>1)s+=':nth-of-type('+(Array.prototype.indexOf.call(sib,n)+1)+')'}parts.unshift(s);n=p}return parts.join(' > ')}catch(e){return''}}
function describe(el){var locEl=el.closest?el.closest('[data-wyber-loc]'):null;return{type:'wyber-element-selected',selector:cssPath(el),tag:el.tagName?el.tagName.toLowerCase():'',text:(el.innerText||'').trim().slice(0,300),classes:typeof el.className==='string'?el.className:'',loc:locEl?locEl.getAttribute('data-wyber-loc'):null}}
function send(obj){try{window.ReactNativeWebView.postMessage(JSON.stringify(obj))}catch(e){}}
function onTap(e){if(!selecting)return;try{var el=e.target;if(!el||el===box)return;selEl=el;place(el);send(describe(el))}catch(err){}}
document.addEventListener('click',onTap,true);
function setSelecting(on){selecting=!!on;if(!on)hideBox()}
function relay(raw){try{var d=typeof raw==='string'?JSON.parse(raw):raw;if(!d||typeof d!=='object')return;
if(d.type==='wyber-edit-mode')setSelecting(!!d.on);
else if(d.type==='wyber-set-class'){var el2=null;try{el2=d.selector?document.querySelector(d.selector):selEl}catch(qe){el2=selEl}if(el2){el2.className=String(d.className||'');if(selecting&&el2===selEl)place(el2)}}
else if(d.type==='wyber-set-text'){var el3=null;try{el3=d.selector?document.querySelector(d.selector):selEl}catch(qe2){el3=selEl}if(el3)el3.innerText=String(d.text==null?'':d.text)}
}catch(e){}}
document.addEventListener('message',function(e){relay(e.data)});
window.addEventListener('message',function(e){relay(e.data)});
})()`

export const WYBER_MOBILE_BRIDGE_SCRIPT = `<script>${WYBER_MOBILE_BRIDGE_SNIPPET}</script>`

type FileVal = { content?: string; language?: string } | string

const fileContent = (v: FileVal | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v : (v.content ?? '')

const withContent = (v: FileVal, content: string): FileVal =>
  typeof v === 'string' ? content : { ...v, content }

/**
 * Append the mobile bridge script to index.html (idempotent, marker-checked).
 * Any failure returns the map unchanged — select mode degrades to a dead
 * toggle, the preview itself is never at risk.
 */
export function injectMobileBridge<T extends Record<string, FileVal>>(files: T): T {
  try {
    const idx = files['index.html']
    const html = fileContent(idx)
    if (!html || html.includes('wyber-select-bridge-mobile')) return files
    const next = html.includes('</body>')
      ? html.replace('</body>', `${WYBER_MOBILE_BRIDGE_SCRIPT}\n</body>`)
      : html + '\n' + WYBER_MOBILE_BRIDGE_SCRIPT
    return { ...files, 'index.html': withContent(idx, next) }
  } catch {
    return files
  }
}
