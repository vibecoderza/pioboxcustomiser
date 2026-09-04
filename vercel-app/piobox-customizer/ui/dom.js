// Minimal hyperscript + DOM morphing so panels can be re-rendered declaratively without
// losing focus, scroll position or in-progress slider drags.

const BOOL_PROPS = new Set(["disabled", "checked", "selected", "hidden", "readOnly", "readonly", "multiple", "required"]);
const VALUE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class" || k === "className") { if (v) el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v); }
      else if (k === "style") { if (typeof v === "string") el.setAttribute("style", v); else for (const [p, val] of Object.entries(v)) { if (val != null) { if (p.startsWith("--")) el.style.setProperty(p, val); else el.style[p] = val; } } }
      else if (k === "key") el.setAttribute("data-key", String(v));
      else if (k === "dataset") { for (const [d, val] of Object.entries(v)) if (val != null) el.dataset[d] = String(val); }
      else if (k.startsWith("on") && typeof v === "function") { (el.__handlers ??= {})[k] = v; el[k] = v; }
      else if (k === "value" && VALUE_TAGS.has(el.tagName)) { el.value = String(v); el.setAttribute("value", String(v)); }
      else if (BOOL_PROPS.has(k)) { el[k] = !!v; if (v) el.setAttribute(k, ""); }
      else if (k === "html") el.innerHTML = String(v);
      else if (k === "ref" && typeof v === "function") v(el);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) { append(el, c); continue; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const frag = (...children) => { const f = document.createDocumentFragment(); append(f, children); return f; };
export function svg(markup, cls) { const span = document.createElement("span"); span.className = `pc-icon${cls ? " " + cls : ""}`; span.setAttribute("aria-hidden", "true"); span.innerHTML = markup; return span; }

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") : null);

export function morph(from, to) {
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) { from.replaceWith(to); return to; }
  if (from.nodeType === 3) { if (from.data !== to.data) from.data = to.data; return from; }
  if (from.nodeType !== 1) return from;
  // attributes
  for (const a of Array.from(to.attributes)) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  for (const a of Array.from(from.attributes)) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  // handlers
  const oldH = from.__handlers ?? {}, newH = to.__handlers ?? {};
  for (const k of Object.keys(oldH)) if (!newH[k]) { from[k] = null; }
  for (const [k, fn] of Object.entries(newH)) from[k] = fn;
  from.__handlers = newH;
  // live props
  const active = document.activeElement === from;
  if (VALUE_TAGS.has(from.tagName)) {
    if (from.type === "checkbox" || from.type === "radio") { if (from.checked !== to.checked) from.checked = to.checked; }
    else if (!active || from.type === "range" || from.type === "color") { if (to.hasAttribute("value") && from.value !== to.value) from.value = to.value; }
  }
  for (const p of ["disabled", "hidden", "readOnly", "multiple", "selected"]) if (p in to && from[p] !== to[p]) from[p] = to[p];
  if (from.tagName === "IMG" && from.getAttribute("src") !== to.getAttribute("src")) from.src = to.getAttribute("src") ?? "";
  if (to.hasAttribute("data-keep")) return from;
  // children
  const oldKids = Array.from(from.childNodes), newKids = Array.from(to.childNodes);
  const oldByKey = new Map();
  for (const k of oldKids) { const key = keyOf(k); if (key) oldByKey.set(key, k); }
  const used = new Set();
  let cursor = 0;
  for (const nk of newKids) {
    const key = keyOf(nk);
    let match = null;
    if (key) { match = oldByKey.get(key) ?? null; }
    else {
      for (let i = cursor; i < oldKids.length; i++) {
        const ok = oldKids[i];
        if (used.has(ok) || keyOf(ok)) continue;
        if (ok.nodeType === nk.nodeType && ok.nodeName === nk.nodeName) { match = ok; break; }
        break;
      }
    }
    if (match && !used.has(match)) {
      used.add(match);
      const node = morph(match, nk);
      const ref = from.childNodes[cursor];
      if (ref !== node) from.insertBefore(node, ref ?? null);
    } else {
      from.insertBefore(nk, from.childNodes[cursor] ?? null);
    }
    cursor++;
  }
  while (from.childNodes.length > cursor) { const last = from.lastChild; if (!last || last.parentNode !== from) break; from.removeChild(last); }
  return from;
}
