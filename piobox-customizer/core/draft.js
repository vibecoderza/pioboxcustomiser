// Draft persistence (localStorage) and share-link encoding.

export const DESIGN_RAIL_MAX = 6;
export const DRAFT_ARTWORK_MAX_BYTES = 2 * 1024 * 1024;

export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;
  const meta = dataUrl.slice(5, comma), isB64 = meta.endsWith(";base64"), type = meta.replace(";base64", "") || "application/octet-stream";
  try {
    if (isB64) { const bin = atob(dataUrl.slice(comma + 1)); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type }); }
    return new Blob([decodeURIComponent(dataUrl.slice(comma + 1))], { type });
  } catch { return null; }
}

// Small files are kept in the draft as data URLs so a refresh restores them.
export function fileToDraftArtwork(file) {
  if (file.size > DRAFT_ARTWORK_MAX_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, type: file.type, dataUrl: String(r.result), isVector: /\.svg$/i.test(file.name) });
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

export function readDraft(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function writeDraft(key, draft) {
  const json = JSON.stringify(draft);
  try { if (json.length <= 3_500_000) { localStorage.setItem(key, json); return "full"; } } catch { /* quota */ }
  try {
    const slim = (sides) => (sides ? { front: sides.front.map((l) => ({ ...l, artwork: null })), back: sides.back.map((l) => ({ ...l, artwork: null })) } : sides);
    localStorage.setItem(key, JSON.stringify({ ...draft, sides: slim(draft.sides), designs: draft.designs?.map((d) => ({ ...d, sides: slim(d.sides) })) }));
    return "slim";
  } catch { return "failed"; }
}
export function clearDraft(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// URL-safe base64 of JSON (used for the default share fallback: text layers + placements travel in the URL).
export function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeShare(str) {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}
