// Main-thread orchestration for garment recolouring: image loading, worker dispatch, caching.
import { prepareGarmentFromRgba, recolorPreparedRgba, downscalePrepared, RECOLOR_MAX_EDGE, RECOLOR_ALPHA_OUTPUT_CUTOFF } from "./recolor-core.js";

// Photos that need special protection. Keys are photo file names (see catalog `photos`).
const PROTECT_BY_FILE = {
  "six-panel-cap-back-white.webp": { openings: true },
  "lanyard-white.webp": { hardware: true },
  "heart-pin-white.webp": { hardware: true },
};
let extraProtect = {};
export function registerPhotoProtection(map) { extraProtect = { ...extraProtect, ...map }; }
const fileOf = (src) => src?.split("?")[0].split("#")[0].split("/").pop();
const protectFor = (src) => { const f = fileOf(src); return f ? (extraProtect[f] ?? PROTECT_BY_FILE[f]) : undefined; };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed to load: ${src}`));
    img.src = src;
  });
}

function readPixels(img) {
  const scale = Math.min(1, RECOLOR_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const raw = ctx.getImageData(0, 0, w, h);
    const total = w * h, alpha = new Uint8ClampedArray(total);
    let translucent = 0, opaque = 0;
    for (let i = 0; i < total; i++) { const a = raw.data[4 * i + 3]; alpha[i] = a; if (a < 250) translucent++; if (a >= 128) opaque++; }
    // Flatten transparent PNG cutouts onto white so the white-sweep works.
    ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "source-over";
    const flat = ctx.getImageData(0, 0, w, h);
    const hasCutout = translucent / total > 0.01 && opaque / total > 0.01 && opaque / total < 0.98;
    return { data: flat.data, width: w, height: h, sourceAlpha: hasCutout ? alpha : undefined };
  } catch { return null; }
}

function readMaskPixels(img, w, h) {
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  try { return ctx.getImageData(0, 0, w, h).data; } catch { return null; }
}

// ---- worker -----------------------------------------------------------------------
let worker = null, workerBroken = false, nextId = 1;
const pending = new Map();
function getWorker() {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./recolor.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, error, ok, width, height, luma, alpha, tex, keep, keepRgb } = e.data;
      const p = pending.get(id); if (!p) return; pending.delete(id);
      if (error) { p.reject(new Error(error)); return; }
      p.resolve({ width, height, ok, luma: new Uint8ClampedArray(luma), alpha: new Uint8ClampedArray(alpha), tex: new Uint8ClampedArray(tex), ...(keep && keepRgb ? { keep: new Uint8ClampedArray(keep), keepRgb: new Uint8ClampedArray(keepRgb) } : {}) });
    };
    worker.onerror = () => { workerBroken = true; for (const p of pending.values()) p.reject(new Error("worker error")); pending.clear(); worker?.terminate(); worker = null; };
    return worker;
  } catch { workerBroken = true; return null; }
}
function prepareInWorker(pixels, protect) {
  const w = getWorker(); if (!w) return null;
  const id = nextId++;
  const buffer = new Uint8ClampedArray(pixels.data).buffer;
  const maskBuffer = pixels.maskData ? new Uint8ClampedArray(pixels.maskData).buffer : undefined;
  const sourceAlphaBuffer = pixels.sourceAlpha ? new Uint8ClampedArray(pixels.sourceAlpha).buffer : undefined;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id); workerBroken = true; worker?.terminate(); worker = null;
      for (const p of pending.values()) p.reject(new Error("worker timeout")); pending.clear();
      reject(new Error("worker timeout"));
    }, 12000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
  });
  const transfer = [buffer]; if (maskBuffer) transfer.push(maskBuffer); if (sourceAlphaBuffer) transfer.push(sourceAlphaBuffer);
  w.postMessage({ id, buffer, maskBuffer, sourceAlphaBuffer, width: pixels.width, height: pixels.height, protect }, transfer);
  return promise;
}

// ---- caches -------------------------------------------------------------------------
function lru(map, key, value, max) { map.delete(key); map.set(key, value); while (map.size > max) { const k = map.keys().next().value; if (k === undefined) break; map.delete(k); } }
const prepared = new Map(), preparing = new Map();
const keyOf = (src, mask) => `${src}|mask:${mask ?? ""}`;

async function prepare(src, maskSrc) {
  const key = keyOf(src, maskSrc);
  const hit = prepared.get(key); if (hit) { lru(prepared, key, hit, 6); return hit; }
  const inflight = preparing.get(key); if (inflight) return inflight;
  const job = (async () => {
    let img; try { img = await loadImage(src); } catch { return null; }
    const pixels = readPixels(img); if (!pixels) return null;
    if (maskSrc) { try { const m = await loadImage(maskSrc); pixels.maskData = readMaskPixels(m, pixels.width, pixels.height) ?? undefined; } catch { /* fall back to white sweep */ } }
    const protect = protectFor(src);
    let result = null;
    try { result = await prepareInWorker(pixels, protect); } catch { result = null; }
    if (!result) { try { result = prepareGarmentFromRgba(pixels.data, pixels.width, pixels.height, pixels.maskData, pixels.sourceAlpha, protect); } catch { return null; } }
    lru(prepared, key, result, 6);
    return result;
  })();
  preparing.set(key, job);
  try { return await job; } finally { preparing.delete(key); }
}

function toDataUrl(canvas) { const webp = canvas.toDataURL("image/webp", 0.92); return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"); }
function paint(preparedGarment, hex) {
  const { width: w, height: h } = preparedGarment;
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const img = ctx.createImageData(w, h); img.data.set(recolorPreparedRgba(preparedGarment, hex)); ctx.putImageData(img, 0, 0);
  return toDataUrl(canvas);
}

const rendered = new Map();
export function prewarmGarment(src, maskSrc) { if (src && !prepared.has(keyOf(src, maskSrc)) && !preparing.has(keyOf(src, maskSrc))) prepare(src, maskSrc); }
export async function recolorGarment(src, hex, maskSrc) {
  const key = `${hex}|${keyOf(src, maskSrc)}`;
  const hit = rendered.get(key); if (hit) { lru(rendered, key, hit, 24); return hit; }
  const p = await prepare(src, maskSrc);
  if (!p || !p.ok) return null;
  const out = paint(p, hex); if (out) lru(rendered, key, out, 24);
  return out;
}
export function peekRecolored(src, hex, maskSrc) { return rendered.get(`${hex}|${keyOf(src, maskSrc)}`) ?? null; }
export async function recolorGarmentThumb(src, hex, maxEdge, maskSrc) {
  const key = `thumb:${maxEdge}|${hex}|${keyOf(src, maskSrc)}`;
  const hit = rendered.get(key); if (hit) return hit;
  const p = await prepare(src, maskSrc); if (!p || !p.ok) return null;
  const out = paint(downscalePrepared(p, maxEdge), hex); if (out) lru(rendered, key, out, 32);
  return out;
}

// ---- "cap" mode: only the top part of the object (e.g. a bottle cap) is recoloured ---------
const capCache = new Map();
async function prepareCap(src) {
  const hit = capCache.get(src); if (hit) return hit;
  let img; try { img = await loadImage(src); } catch { return null; }
  const pixels = readPixels(img); if (!pixels) return null;
  let p; try { p = prepareGarmentFromRgba(pixels.data, pixels.width, pixels.height, undefined, pixels.sourceAlpha); } catch { return null; }
  if (!p.ok) return null;
  const { width: w, height: h } = pixels;
  // Flood the topmost 10% of the silhouette rows.
  let top = h, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.alpha[y * w + x] >= 200) { if (y < top) top = y; bottom = y; break; }
  const capMask = new Uint8Array(w * h);
  if (bottom > top) {
    const limit = Math.min(h - 1, Math.ceil(top + (bottom - top) * 0.1));
    const seen = new Uint8Array(w * h), queue = new Int32Array(w * h); let qh = 0, qt = 0;
    const push = (i) => { if (!seen[i]) { seen[i] = 1; queue[qt++] = i; } };
    for (let x = 0; x < w; x++) { const i = top * w + x; if (p.alpha[i] >= 200) push(i); }
    while (qh < qt) {
      const i = queue[qh++]; if (p.alpha[i] < 200) continue;
      capMask[i] = 1;
      const x = i % w, y = (i - x) / w;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > top) push(i - w); if (y < limit) push(i + w);
    }
  }
  const entry = { width: w, height: h, base: new Uint8ClampedArray(pixels.data), prepared: p, capMask };
  lru(capCache, src, entry, 3);
  return entry;
}
export async function recolorCapGarment(src, hex) {
  const key = `cap|${hex}|${src}`;
  const hit = rendered.get(key); if (hit) return hit;
  const c = await prepareCap(src); if (!c) return null;
  const { width: w, height: h, base, prepared: p, capMask } = c;
  const painted = recolorPreparedRgba(p, hex), out = new Uint8ClampedArray(base);
  for (let i = 0; i < w * h; i++) {
    const o = 4 * i, a = p.alpha[i];
    if (a < RECOLOR_ALPHA_OUTPUT_CUTOFF) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    out[o + 3] = a;
    if (capMask[i]) { out[o] = painted[o]; out[o + 1] = painted[o + 1]; out[o + 2] = painted[o + 2]; out[o + 3] = painted[o + 3]; }
  }
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const img = ctx.createImageData(w, h); img.data.set(out); ctx.putImageData(img, 0, 0);
  const url = toDataUrl(canvas); lru(rendered, key, url, 24);
  return url;
}
