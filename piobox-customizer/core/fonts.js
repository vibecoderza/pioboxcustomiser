// Font registry: built-in faces, merchant-configured faces (self-hosted or Google Fonts) and
// customer-uploaded fonts (TTF/OTF/WOFF/WOFF2) persisted per browser in IndexedDB.

export const BUILTIN_FONTS = [
  { id: "impact", label: "Impact", name: "Anton", family: "Anton", weight: "400", file: "anton-latin.woff2", fallback: "Impact, 'Arial Narrow Bold', sans-serif" },
  { id: "modern", label: "Modern", name: "Geist", family: "Geist", weight: "600", file: "geist-latin.woff2", fallback: "ui-sans-serif, system-ui, sans-serif" },
  { id: "varsity", label: "Varsity", name: "Graduate", family: "Graduate", weight: "400", file: "graduate-latin.woff2", fallback: "'Times New Roman', serif" },
  { id: "serif", label: "Serif", name: "Playfair Display", family: "Playfair Display", weight: "600", file: "playfair-display-latin.woff2", fallback: "Georgia, 'Times New Roman', serif" },
  { id: "script", label: "Script", name: "Pacifico", family: "Pacifico", weight: "400", file: "pacifico-latin.woff2", fallback: "'Brush Script MT', cursive" },
  { id: "mono", label: "Mono", name: "Geist Mono", family: "Geist Mono", weight: "500", file: "geist-mono-latin.woff2", fallback: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

const DB_NAME = "piobox-customizer";
const STORE = "fonts";
const FONT_EXTS = [".ttf", ".otf", ".woff", ".woff2"];
export const FONT_ACCEPT_ATTR = FONT_EXTS.join(",");
export const MAX_FONT_BYTES = 6 * 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), store = tx.objectStore(STORE);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const quote = (family) => (/^[a-z0-9_-]+$/i.test(family) ? family : `'${family.replace(/'/g, "\\'")}'`);
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export class FontRegistry {
  constructor({ fontBase = "", fonts = [], allowUpload = true } = {}) {
    this.fontBase = fontBase.replace(/\/$/, "");
    this.allowUpload = allowUpload;
    this.fonts = new Map();
    this.listeners = new Set();
    this.injected = new Set();
    for (const f of BUILTIN_FONTS) this.fonts.set(f.id, { ...f, source: "builtin", cssFamily: `${quote(f.family)}, ${f.fallback}` });
    for (const f of fonts) this.addConfigured(f);
    this.injectBuiltinCss();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.list()); }
  list() { return [...this.fonts.values()]; }
  get(id) { return this.fonts.get(id) ?? this.fonts.get(BUILTIN_FONTS[0].id); }
  defaultId() { return BUILTIN_FONTS[0].id; }
  cssFamily(id) { return this.get(id).cssFamily; }
  canvasFamily(id) { const f = this.get(id); return `${quote(f.family)}, ${f.fallback ?? "sans-serif"}`; }
  weight(id) { return String(this.get(id).weight ?? "400"); }

  injectBuiltinCss() {
    if (typeof document === "undefined" || document.getElementById("pc-builtin-fonts")) return;
    const css = BUILTIN_FONTS.map((f) => {
      const range = f.name.startsWith("Geist") ? "100 900" : f.name === "Playfair Display" ? "400 900" : "400";
      return `@font-face{font-family:${quote(f.family)};font-style:normal;font-weight:${range};font-display:swap;src:url("${this.fontBase}/${f.file}") format("woff2")}`;
    }).join("\n");
    const style = document.createElement("style"); style.id = "pc-builtin-fonts"; style.textContent = css;
    document.head.appendChild(style);
  }

  // Merchant-configured font: { id, label, family, weight?, src?: url, google?: true, fallback? }
  addConfigured(f) {
    const id = f.id ?? `font-${hash(f.family)}`;
    const entry = { id, label: f.label ?? f.family, name: f.family, family: f.family, weight: String(f.weight ?? "400"), fallback: f.fallback ?? "sans-serif", source: "configured", cssFamily: `${quote(f.family)}, ${f.fallback ?? "sans-serif"}` };
    this.fonts.set(id, entry);
    if (f.google) this.injectGoogle(f.family, entry.weight);
    else if (f.src) this.injectFace(f.family, f.src, entry.weight);
    return entry;
  }
  injectGoogle(family, weight) {
    const key = `google:${family}:${weight}`;
    if (this.injected.has(key) || typeof document === "undefined") return;
    this.injected.add(key);
    const link = document.createElement("link"); link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weight}&display=swap`;
    document.head.appendChild(link);
  }
  injectFace(family, src, weight) {
    const key = `face:${family}:${src}`;
    if (this.injected.has(key) || typeof document === "undefined") return;
    this.injected.add(key);
    try { const face = new FontFace(family, `url("${src}")`, { weight }); document.fonts.add(face); face.load().catch(() => {}); } catch { /* ignore */ }
  }

  async ensureLoaded(id, sample = "Ag") {
    const f = this.get(id);
    try { await document.fonts.load(`${f.weight} 64px ${quote(f.family)}`, sample); } catch { /* ignore */ }
  }

  // ---- customer uploads ------------------------------------------------------------
  static isFontFile(file) { const n = file.name.toLowerCase(); return FONT_EXTS.some((e) => n.endsWith(e)); }
  async addFile(file, { persist = true } = {}) {
    if (!this.allowUpload) throw new Error("Font uploads are disabled.");
    if (!FontRegistry.isFontFile(file)) throw new Error("Use a TTF, OTF, WOFF or WOFF2 font file.");
    if (file.size > MAX_FONT_BYTES) throw new Error(`Font file is too large (max ${Math.round(MAX_FONT_BYTES / 1048576)} MB).`);
    const bytes = await file.arrayBuffer();
    return this.registerUploaded({ id: `upload-${hash(file.name + file.size)}`, name: file.name, bytes, type: file.type }, persist);
  }
  async registerUploaded(rec, persist) {
    const stem = rec.name.replace(/\.[^.]+$/, "");
    const family = `PC Upload ${stem}`.replace(/[^\w \-]/g, "").slice(0, 60) || `PC Upload ${rec.id}`;
    const face = new FontFace(family, rec.bytes, { weight: "400" });
    await face.load();
    document.fonts.add(face);
    const entry = { id: rec.id, label: stem.slice(0, 24), name: stem, family, weight: "400", fallback: "sans-serif", source: "uploaded", cssFamily: `${quote(family)}, sans-serif`, fileName: rec.name, mime: rec.type || "font/ttf", bytes: rec.bytes };
    this.fonts.set(entry.id, entry);
    if (persist) { try { await idb("readwrite", (s) => s.put({ id: rec.id, name: rec.name, bytes: rec.bytes, type: rec.type })); } catch { /* storage unavailable */ } }
    this.emit();
    return entry;
  }
  async restoreUploaded() {
    if (!this.allowUpload) return [];
    let rows = [];
    try { rows = (await idb("readonly", (s) => s.getAll())) ?? []; } catch { return []; }
    const out = [];
    for (const r of rows) { try { out.push(await this.registerUploaded(r, false)); } catch { /* skip broken font */ } }
    return out;
  }
  async remove(id) {
    const f = this.fonts.get(id);
    if (!f || f.source !== "uploaded") return false;
    this.fonts.delete(id);
    try { await idb("readwrite", (s) => s.delete(id)); } catch { /* ignore */ }
    this.emit();
    return true;
  }
  // Data URL of an uploaded font so it can travel with the order for production.
  exportUploaded(id) {
    const f = this.fonts.get(id);
    if (!f || f.source !== "uploaded" || !f.bytes) return null;
    let bin = ""; const u8 = new Uint8Array(f.bytes);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { name: f.fileName, type: f.mime, dataUrl: `data:${f.mime};base64,${btoa(bin)}` };
  }
}
