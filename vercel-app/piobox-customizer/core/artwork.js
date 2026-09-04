// Artwork import: decodes images, rasterises PDF / AI (via pdf.js, loaded on demand from a CDN).

const RASTER_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"];
const CONVERTIBLE_EXTS = [".pdf", ".ai"];
export const ACCEPT_ATTR = [...RASTER_EXTS, ...CONVERTIBLE_EXTS].join(",");
export const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;
export const PDFJS_DEFAULT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
export const PDFJS_WORKER_DEFAULT = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const extOf = (name) => { const i = name.lastIndexOf("."); return i >= 0 ? name.slice(i).toLowerCase() : ""; };
export const isConvertibleArtwork = (name) => CONVERTIBLE_EXTS.includes(extOf(name));
export const isAcceptedArtwork = (name) => RASTER_EXTS.includes(extOf(name)) || isConvertibleArtwork(name);

export class PrintFileError extends Error {}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

// SVGs without width/height decode with 0×0 in some browsers; give them explicit dimensions.
async function normalizeSvg(file) {
  let text; try { text = await file.text(); } catch { return file; }
  const hasSize = /<svg[^>]*\swidth\s*=/.test(text) && /<svg[^>]*\sheight\s*=/.test(text);
  if (hasSize) return file;
  const vb = text.match(/viewBox\s*=\s*["']\s*([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.\-]+)/i);
  if (!vb) return file;
  const w = Number(vb[3]), h = Number(vb[4]);
  if (!(w > 0 && h > 0)) return file;
  const scale = 1024 / Math.max(w, h);
  const patched = text.replace(/<svg\b/i, `<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}"`);
  return new File([patched], file.name, { type: "image/svg+xml" });
}

export async function probeArtworkFile(file) {
  const isVector = /\.svg$/i.test(file.name);
  if (isVector) file = await normalizeSvg(file);
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ file, url, naturalW: img.naturalWidth || 1024, naturalH: img.naturalHeight || 1024, isVector });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to decode ${file.name}`)); };
    img.src = url;
  });
}

// ---- PDF / AI conversion -------------------------------------------------------------
let pdfjsPromise = null;
function loadPdfJs(opts) {
  return (pdfjsPromise ??= (async () => {
    const mod = await import(/* @vite-ignore */ opts?.pdfjsUrl ?? PDFJS_DEFAULT);
    const lib = mod.default ?? mod;
    lib.GlobalWorkerOptions.workerSrc = opts?.pdfjsWorkerUrl ?? PDFJS_WORKER_DEFAULT;
    return lib;
  })());
}
function inkBounds(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const scan = (isBlank) => {
    let l = w, t = h, r = -1, b = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!isBlank((y * w + x) * 4)) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    return r < 0 ? null : { x: l, y: t, w: r - l + 1, h: b - t + 1 };
  };
  const alphaBox = scan((i) => d[i + 3] <= 8);
  if (!alphaBox) return null;
  if (alphaBox.w >= 0.98 * w && alphaBox.h >= 0.98 * h) return scan((i) => d[i + 3] <= 8 || (d[i] >= 250 && d[i + 1] >= 250 && d[i + 2] >= 250)) ?? alphaBox;
  return alphaBox;
}
async function renderPage(page, scale, crop) {
  const viewport = crop ? page.getViewport({ scale, offsetX: -crop.x, offsetY: -crop.y }) : page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(crop ? crop.w : viewport.width)); canvas.height = Math.max(1, Math.ceil(crop ? crop.h : viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  await page.render({ canvasContext: ctx, canvas, viewport, background: "rgba(0,0,0,0)" }).promise;
  return canvas;
}
export async function convertPrintFileToPng(file, opts) {
  let lib;
  try { lib = await loadPdfJs(opts); } catch { throw new PrintFileError("PDF/AI conversion needs an internet connection to load the converter. Export a PNG or SVG instead."); }
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data });
  let doc;
  try { doc = await task.promise; } catch {
    throw new PrintFileError(/\.ai$/i.test(file.name) ? "We couldn't open that .ai file. Save it with PDF compatibility on (Illustrator's default), or export a PDF, SVG, or PNG." : "We couldn't open that PDF. Re-export it and try again, or send a PNG or SVG.");
  }
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const probe = await renderPage(page, 640 / Math.max(base.width, base.height));
    const box = inkBounds(probe.getContext("2d"), probe.width, probe.height);
    if (!box) throw new PrintFileError("That file looks blank. Check the export and try again.");
    const probeScale = probe.width / base.width;
    const contentPts = Math.max(box.w, box.h) / probeScale;
    const scale = Math.min(2400 / contentPts, 32), k = scale / probeScale;
    const margin = Math.ceil(Math.max(box.w, box.h) * k * 0.05) + 8;
    const cx = Math.max(0, box.x * k - margin), cy = Math.max(0, box.y * k - margin);
    const crop = { x: cx, y: cy, w: Math.min(base.width * scale - cx, box.w * k + 2 * margin), h: Math.min(base.height * scale - cy, box.h * k + 2 * margin) };
    const hi = await renderPage(page, scale, crop);
    const tight = inkBounds(hi.getContext("2d"), hi.width, hi.height) ?? { x: 0, y: 0, w: hi.width, h: hi.height };
    const pad = Math.ceil(0.02 * Math.max(tight.w, tight.h)) + 2;
    const x = Math.max(0, tight.x - pad), y = Math.max(0, tight.y - pad);
    const w = Math.min(hi.width - x, tight.w + 2 * pad), h = Math.min(hi.height - y, tight.h + 2 * pad);
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    out.getContext("2d").drawImage(hi, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise((res) => out.toBlob(res, "image/png"));
    if (!blob) throw new PrintFileError("We couldn't convert that file. Try a PNG or SVG export.");
    return new File([blob], `${file.name}.png`, { type: "image/png" });
  } catch (e) {
    if (e instanceof PrintFileError) throw e;
    throw new PrintFileError("We couldn't turn that file into a preview. Please upload a PNG or SVG version.");
  } finally { doc.destroy(); }
}
export async function probeAnyArtworkFile(file, opts) {
  return probeArtworkFile(isConvertibleArtwork(file.name) ? await convertPrintFileToPng(file, opts) : file);
}
