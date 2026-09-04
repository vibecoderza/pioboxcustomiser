// Artwork preflight: analyses an uploaded file and reports print-readiness per decoration method.
import { hexToLab, deltaE2000, hexDeltaE, hexToRgb, rgbToHex } from "./color.js";

const ascii = (u8, n) => { let s = ""; for (let i = 0; i < Math.min(u8.length, n); i++) s += String.fromCharCode(u8[i]); return s; };
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const NON_PAINT = new Set(["none", "inherit", "currentcolor", "transparent", "context-fill", "context-stroke", "url"]);

function sniffKind(u8) {
  if (u8.length >= 8 && u8[0] === 137 && u8[1] === 80 && u8[2] === 78 && u8[3] === 71) return "png";
  if (u8.length >= 3 && u8[0] === 255 && u8[1] === 216 && u8[2] === 255) return "jpeg";
  if (u8.length >= 6 && u8[0] === 71 && u8[1] === 73 && u8[2] === 70 && u8[3] === 56) return "gif";
  if (u8.length >= 12 && u8[0] === 82 && u8[1] === 73 && u8[2] === 70 && u8[3] === 70 && u8[8] === 87 && u8[9] === 69 && u8[10] === 66 && u8[11] === 80) return "webp";
  if (u8.length >= 5 && u8[0] === 37 && u8[1] === 80 && u8[2] === 68 && u8[3] === 70) return "pdf";
  if (ascii(u8, 512).toLowerCase().includes("<svg")) return "svg";
  return "unknown";
}
function pngDpi(u8) {
  let p = 8;
  while (p + 12 <= u8.length) {
    const len = (u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
    const type = ascii(u8.subarray(p + 4, p + 8), 4);
    if (type === "pHYs" && len === 9 && p + 12 + 9 <= u8.length) {
      const o = p + 8, ppu = ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
      if (u8[o + 8] === 1 && ppu > 0) return Math.round(0.0254 * ppu);
      break;
    }
    if (type === "IDAT" || type === "IEND" || len < 0) break;
    p += 12 + len;
  }
  return null;
}
function jpegDpi(u8) {
  let p = 2;
  while (p + 4 <= u8.length && u8[p] === 255) {
    const m = u8[p + 1];
    if (m === 216 || (m >= 208 && m <= 217)) { p += 2; continue; }
    if (m === 218) break;
    const len = (u8[p + 2] << 8) | u8[p + 3];
    if (len < 2) break;
    if (m === 224 && p + 4 + len - 2 <= u8.length) {
      const o = p + 4;
      if (ascii(u8.subarray(o, o + 5), 5) === "JFIF\0" && len >= 16) {
        const units = u8[o + 7], x = (u8[o + 8] << 8) | u8[o + 9];
        if (x > 0) { if (units === 1) return x; if (units === 2) return Math.round(2.54 * x); }
        break;
      }
    }
    p += 2 + len;
  }
  return null;
}
function svgFacts(text) {
  const embeddedRasterCount = (text.match(/<image[\s/>]/gi) ?? []).length;
  const hasLiveText = /<text[\s/>]/i.test(text), hasGradient = /<(?:linear|radial)Gradient[\s/>]/i.test(text);
  const paints = new Set(), re = /(?:fill|stroke)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)"']*\)|[a-z][a-z-]*)/gi;
  let m; while ((m = re.exec(text)) !== null) { const v = m[1].toLowerCase().trim(); if (!v.startsWith("url(") && !NON_PAINT.has(v)) paints.add(v); }
  return { embeddedRasterCount, hasLiveText, hasGradient, paintCount: paints.size };
}

function computeStats(d, w, h) {
  const total = w * h;
  let hasAlpha = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
  // Solid background detection (edge ring colour).
  const solid = hasAlpha ? null : (() => {
    let sr = 0, sg = 0, sb = 0, n = 0;
    const ring = Math.min(2, Math.floor(Math.min(w, h) / 2));
    const add = (x, y) => { const i = (y * w + x) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; };
    for (let y = 0; y < h; y++) {
      if (y < ring || y >= h - ring) for (let x = 0; x < w; x++) add(x, y);
      else { for (let x = 0; x < ring; x++) add(x, y); for (let x = w - ring; x < w; x++) add(x, y); }
    }
    if (n === 0) return null;
    const r = sr / n, g = sg / n, b = sb / n; let match = 0, count = 0;
    for (let y = 0; y < h; y++) {
      const edgeRow = y < ring || y >= h - ring;
      for (let x = 0; x < w; x++) {
        if (!edgeRow && x >= ring && x < w - ring) continue;
        const i = (y * w + x) * 4; count++;
        if (Math.abs(d[i] - r) <= 22 && Math.abs(d[i + 1] - g) <= 22 && Math.abs(d[i + 2] - b) <= 22) match++;
      }
    }
    return count === 0 || match / count < 0.9 ? null : { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  })();
  const isInk = (i) => (hasAlpha ? d[i + 3] > 8 : !solid || Math.abs(d[i] - solid.r) > 22 || Math.abs(d[i + 1] - solid.g) > 22 || Math.abs(d[i + 2] - solid.b) > 22);
  const ink = new Uint8Array(total);
  let inkCount = 0, semi = 0, opaque = 0, opaqueLuma = 0, semiLuma = 0, nearWhite = 0, nearBlack = 0;
  let l = w, t = h, r = -1, b = -1;
  const bins = new Uint32Array(4096), binSum = new Float64Array(12288);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = 4 * p;
    if (!isInk(i)) continue;
    ink[p] = 1; inkCount++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    const R = d[i], G = d[i + 1], B = d[i + 2];
    if ((hasAlpha ? d[i + 3] : 255) < 200) { semi++; semiLuma += luma(R, G, B); continue; }
    opaque++; opaqueLuma += luma(R, G, B);
    if (R >= 232 && G >= 232 && B >= 232) nearWhite++;
    if (R <= 45 && G <= 45 && B <= 45) nearBlack++;
    const bin = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
    bins[bin]++; binSum[3 * bin] += R; binSum[3 * bin + 1] += G; binSum[3 * bin + 2] += B;
  }
  const inkBox = r >= 0 ? { x: l, y: t, w: r - l + 1, h: b - t + 1 } : null;
  // Continuous tone estimate: share of small horizontal gradients between neighbouring ink pixels.
  let soft = 0, pairs = 0; const step = Math.max(1, Math.floor(h / 256));
  for (let y = 0; y < h; y += step) for (let x = 1; x < w; x++) {
    const p = y * w + x; if (!ink[p] || !ink[p - 1]) continue;
    const i = 4 * p, j = i - 4;
    if (hasAlpha && (d[i + 3] < 200 || d[j + 3] < 200)) continue;
    const delta = Math.max(Math.abs(d[i] - d[j]), Math.abs(d[i + 1] - d[j + 1]), Math.abs(d[i + 2] - d[j + 2]));
    pairs++; if (delta >= 3 && delta <= 26) soft++;
  }
  const softRatio = pairs > 0 ? soft / pairs : 0;
  const { colors, distinctBins } = opaque > 0 ? clusterColors(bins, binSum, opaque) : { colors: [], distinctBins: 0 };
  const semiFrac = inkCount > 0 ? semi / inkCount : 0, meanInkLuma = opaque > 0 ? opaqueLuma / opaque : 0, meanSemiLuma = semi > 0 ? semiLuma / semi : 0;
  const whiteHalo = hasAlpha && semiFrac > 0.004 && opaque > 0 && meanInkLuma < 140 && meanSemiLuma - meanInkLuma > 60;
  // Thin-line fraction: how much ink disappears after 1/2/3 erosions.
  const thin = [0, 0, 0];
  if (inkCount > 0) {
    const tmp = new Uint8Array(total); let cur = ink.slice(), remaining = inkCount;
    for (let k = 0; k < 3; k++) {
      let n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x; let v = cur[p];
        if (v) {
          if (x === 0 || x === w - 1 || y === 0 || y === h - 1) v = 0;
          else for (let dy = -1; dy <= 1 && v; dy++) { const q = p + dy * w; if (!(cur[q - 1] && cur[q] && cur[q + 1])) v = 0; }
        }
        tmp[p] = v; if (v) n++;
      }
      cur.set(tmp); remaining = n; thin[k] = (inkCount - remaining) / inkCount;
    }
  }
  return {
    analysisW: w, analysisH: h, hasAlpha, inkFraction: total > 0 ? inkCount / total : 0, semiTransparentFraction: semiFrac,
    solidBackground: solid ? { hex: rgbToHex(solid), nearWhite: solid.r >= 240 && solid.g >= 240 && solid.b >= 240 } : null,
    whiteHalo, colors, colorCount: colors.length, continuousTone: softRatio > 0.4 || distinctBins > 220,
    nearWhiteFraction: opaque > 0 ? nearWhite / opaque : 0, nearBlackFraction: opaque > 0 ? nearBlack / opaque : 0,
    meanInkLuma, thinInkFraction: thin, inkBox,
  };
}
function clusterColors(bins, binSum, opaque) {
  const list = []; let distinct = 0; const minPop = Math.max(3, 2e-4 * opaque);
  for (let b = 0; b < 4096; b++) { const pop = bins[b]; if (pop === 0) continue; if (pop >= minPop) distinct++; list.push({ pop, r: binSum[3 * b] / pop, g: binSum[3 * b + 1] / pop, b: binSum[3 * b + 2] / pop }); }
  list.sort((a, b) => b.pop - a.pop);
  const clusters = [];
  const labOf = (r, g, b) => hexToLab(rgbToHex({ r: Math.round(r), g: Math.round(g), b: Math.round(b) }));
  for (let i = 0; i < Math.min(list.length, 400); i++) {
    const e = list[i], lab = labOf(e.r, e.g, e.b);
    let best = null, bestD = Infinity;
    for (const c of clusters) { const d = deltaE2000(lab, c.lab); if (d < bestD) { bestD = d; best = c; } }
    if (best && bestD < 16) { best.pop += e.pop; best.sr += e.r * e.pop; best.sg += e.g * e.pop; best.sb += e.b * e.pop; }
    else if (clusters.length < 20) clusters.push({ pop: e.pop, sr: e.r * e.pop, sg: e.g * e.pop, sb: e.b * e.pop, lab });
  }
  clusters.sort((a, b) => b.pop - a.pop);
  return { colors: clusters.filter((c) => c.pop / opaque >= 0.015).slice(0, 8).map((c) => ({ hex: rgbToHex({ r: Math.round(c.sr / c.pop), g: Math.round(c.sg / c.pop), b: Math.round(c.sb / c.pop) }), fraction: c.pop / opaque })), distinctBins: distinct };
}

const cache = new WeakMap();
export function analyzeArtwork(artwork) {
  let p = cache.get(artwork.file);
  if (!p) { p = analyze(artwork); cache.set(artwork.file, p); }
  return p;
}
async function analyze(art) {
  let head = new Uint8Array(0);
  try { head = new Uint8Array(await art.file.slice(0, 65536).arrayBuffer()); } catch { /* ignore */ }
  let svgText = null;
  if (art.isVector && art.file.size <= 3145728) { try { svgText = await art.file.text(); } catch { svgText = null; } }
  const kind = sniffKind(head);
  const meta = {
    kind, metadataDpi: kind === "png" ? pngDpi(head) : kind === "jpeg" ? jpegDpi(head) : null,
    vectorSource: kind === "svg" ? "svg" : /\.pdf\.png$/i.test(art.file.name) || kind === "pdf" ? "pdf" : /\.ai\.png$/i.test(art.file.name) ? "ai" : null,
    svg: kind === "svg" && svgText ? svgFacts(svgText) : null,
  };
  const base = { fileName: art.file.name, fileBytes: art.file.size, sourceW: art.naturalW, sourceH: art.naturalH, isVector: art.isVector, meta, stats: null };
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode failed")); i.src = art.url; });
    const sw = Math.max(1, art.naturalW), sh = Math.max(1, art.naturalH), edge = Math.max(sw, sh);
    const k = art.isVector ? 1024 / edge : Math.min(1, 1024 / edge);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return base;
    ctx.drawImage(img, 0, 0, w, h);
    return { ...base, stats: computeStats(ctx.getImageData(0, 0, w, h).data, w, h) };
  } catch { return base; }
}

export function garmentContrastLevel(colors, meanInkLuma, garmentHex) {
  if (colors.length === 0) return "good";
  const maxDelta = colors.reduce((m, c) => Math.max(m, hexDeltaE(c.hex, garmentHex)), 0);
  const { r, g, b } = hexToRgb(garmentHex), gl = luma(r, g, b);
  return maxDelta < 12 || (gl < 32 && meanInkLuma < 42) || (gl > 216 && meanInkLuma > 210) ? "low" : "good";
}
export function suggestContrastingGarment(colors, meanInkLuma, candidates) {
  const ok = candidates.filter((c) => garmentContrastLevel(colors, meanInkLuma, c.hex) === "good");
  if (ok.length === 0) return null;
  const score = (hex) => colors.reduce((m, c) => Math.max(m, hexDeltaE(c.hex, hex)), 0);
  return ok.reduce((best, c) => (score(c.hex) > score(best.hex) ? c : best));
}

const METHOD_LABEL = { screen: "Screen print", embroidery: "Embroidery", dtg: "DTG" };
const MAX_AREA_IN = { screen: { w: 14, h: 16 }, dtg: { w: 13, h: 16 }, embroidery: { w: 12, h: 15 } };
const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };
const widthIn = (v) => Math.max(0.5, v);

function findings(a, method, printedWidthIn, garmentHex) {
  const out = [];
  // Resolution / vector
  if (a.isVector) {
    out.push({ id: "vector", severity: "pass", title: "Vector artwork, stays sharp at any print size", short: "vector" });
    if (a.meta.svg) {
      if (a.meta.svg.embeddedRasterCount > 0) out.push({ id: "svg-embedded-raster", severity: "warn", title: "This SVG embeds raster images, so it won't scale like a true vector", detail: "Export the artwork as pure paths, or send the original layered file.", short: "raster inside SVG" });
      if (a.meta.svg.hasLiveText) out.push({ id: "svg-live-text", severity: "warn", title: "Live text detected in the SVG", detail: "Convert text to outlines before production so fonts can't substitute.", short: "live text in SVG" });
    }
  } else {
    const dpi = Math.round(a.sourceW / widthIn(printedWidthIn)), at = `${widthIn(printedWidthIn).toFixed(1)} in wide`;
    const need = `A file about ${Math.ceil(300 * widthIn(printedWidthIn)).toLocaleString("en-US")} px wide would print crisply at this size.`;
    if (a.meta.vectorSource === "pdf" || a.meta.vectorSource === "ai") out.push({ id: "vector-source", severity: "pass", title: `Vector print file (${a.meta.vectorSource.toUpperCase()}), converted at high resolution`, detail: "We'll use your original vector for production.", short: "vector source" });
    else if (dpi >= 300) out.push({ id: "resolution", severity: "pass", title: `Excellent resolution (${dpi} DPI at ${at})`, short: "high resolution" });
    else if (dpi >= 150) out.push({ id: "resolution", severity: "pass", title: `Sharp at this size (${dpi} DPI at ${at})`, short: "sharp resolution" });
    else if (dpi >= 90) out.push({ id: "resolution", severity: "info", title: `Workable resolution (${dpi} DPI at ${at})`, detail: "Fine for most prints. 150+ DPI is ideal; shrink the print or send larger art for crisper edges.", short: "medium resolution" });
    else if (dpi >= 45) out.push({ id: "resolution", severity: "warn", title: `Low resolution (${dpi} DPI at ${at})`, detail: `Edges will soften at this size. ${need} A vector also prints sharp at any size, or print it smaller.`, short: "low resolution" });
    else out.push({ id: "resolution", severity: "fail", title: `Resolution far too low (${dpi} DPI at ${at})`, detail: `This will print visibly pixelated. ${need} A vector version prints sharp at any size.`, short: "very low resolution" });
  }
  const s = a.stats;
  if (s) {
    if (s.solidBackground) out.push({ id: "solid-background", severity: "warn", title: s.solidBackground.nearWhite ? "Solid white background will print as part of the design" : "Solid background will print as part of the design", detail: "Send a transparent PNG or vector if you only want the logo. We can also remove it for you on proof.", short: s.solidBackground.nearWhite ? "white background" : "solid background" });
    else if (s.hasAlpha) out.push({ id: "transparent-bg", severity: "pass", title: "Transparent background", short: "transparent background" });
    if (garmentHex && s.colorCount > 0 && !s.continuousTone) {
      if (garmentContrastLevel(s.colors, s.meanInkLuma, garmentHex) === "low") out.push({ id: "garment-contrast", severity: "warn", title: "Low contrast against the garment color, so the art won't stand out", detail: "Pick a more contrasting garment shade, or add an outline or contrasting color to the art.", short: "low garment contrast" });
      else out.push({ id: "garment-contrast", severity: "pass", title: "Good contrast against the chosen garment color", short: "good garment contrast" });
    } else if (!garmentHex && s.nearWhiteFraction > 0.45) out.push({ id: "mostly-light", severity: "info", title: "Mostly light artwork, reads best on darker garments", short: "light artwork" });
    else if (!garmentHex && s.nearBlackFraction > 0.6) out.push({ id: "mostly-dark", severity: "info", title: "Mostly dark artwork, reads best on lighter garments", short: "dark artwork" });
    const colorsLabel = `${s.colorCount} ${s.colorCount === 1 ? "color" : "colors"}`;
    if (method === "screen") {
      if (s.continuousTone) out.push({ id: "screen-tone", severity: "warn", title: "Gradients or photo detail print as halftone dots in screen printing", detail: "Looks intentional on some art. For exact full-color reproduction, DTG is the better fit.", short: "gradients halftone" });
      else if (s.colorCount > 8) out.push({ id: "screen-colors", severity: "warn", title: `${colorsLabel} detected, a lot of screens for one print`, detail: "Each color adds a screen and cost. Simplify the palette, or switch to DTG.", short: `${s.colorCount} colors` });
      else if (s.colorCount > 0) out.push({ id: "screen-colors", severity: s.colorCount === 1 ? "pass" : "info", title: s.colorCount === 1 ? "Single-color design, the most economical screen print" : `${colorsLabel} detected (each color adds a screen)`, short: colorsLabel });
      if (s.semiTransparentFraction > 0.1) out.push({ id: "screen-transparency", severity: "warn", title: "Soft shadows or semi-transparent areas won't reproduce with opaque inks", detail: "Flatten transparency effects, or choose DTG which prints them faithfully.", short: "soft transparency" });
      if (s.whiteHalo) out.push({ id: "halo", severity: "warn", title: "Light halo around the edges (usually left over from background removal)", detail: "We can clean the edges on proof, or re-export the art with a clean cutout.", short: "edge halo" });
    }
    if (method === "dtg") {
      if (s.continuousTone) out.push({ id: "dtg-tone", severity: "pass", title: "Full-color artwork, exactly what DTG is for", short: "full color" });
      if (s.whiteHalo) out.push({ id: "halo", severity: "warn", title: "Light halo around the edges may show on dark garments", detail: "We can clean the edges on proof, or re-export the art with a clean cutout.", short: "edge halo" });
    }
    if (method === "embroidery") {
      if (s.continuousTone) out.push({ id: "emb-tone", severity: "fail", title: "Gradients and photo detail can't be stitched", detail: "Embroidery uses solid thread colors. Simplify to flat shapes, or choose a print method.", short: "gradients can't stitch" });
      const thin = s.inkFraction === 0 ? null : s.thinInkFraction[Math.min(3, Math.max(1, Math.round(1 / (2 * ((25.4 * widthIn(printedWidthIn)) / s.analysisW))))) - 1] ?? null;
      if (thin != null && thin > 0.55) out.push({ id: "emb-thin", severity: "fail", title: "Mostly fine lines, too thin to embroider at this size", detail: "Stitches need lines about 1 mm and up. Thicken the strokes or embroider it larger.", short: "lines too thin" });
      else if (thin != null && thin > 0.32) out.push({ id: "emb-thin", severity: "warn", title: "Fine lines sit near the ~1 mm stitch minimum", detail: "Small text and hairlines may fill in. We'll adjust the digitizing on proof.", short: "fine lines" });
      if (!s.continuousTone && s.colorCount > 9) out.push({ id: "emb-colors", severity: "warn", title: `${colorsLabel} means many thread changes`, detail: "Most embroidery looks best under 9 thread colors.", short: `${s.colorCount} thread colors` });
      if (widthIn(printedWidthIn) > 10) out.push({ id: "emb-size", severity: "warn", title: `Very large stitch area (~${widthIn(printedWidthIn).toFixed(0)} in wide)`, detail: "Big fills mean high stitch counts and cost. Chest-size embroidery is the sweet spot.", short: "large stitch area" });
      if (s.semiTransparentFraction > 0.1 && !s.continuousTone) out.push({ id: "emb-transparency", severity: "warn", title: "Soft transparency effects can't be stitched", detail: "Embroidery is solid thread. Flatten the art to hard shapes.", short: "soft transparency" });
    }
  }
  if (a.sourceW > 0 && a.sourceH > 0) {
    const wIn = widthIn(printedWidthIn), hIn = wIn * (a.sourceH / a.sourceW), max = MAX_AREA_IN[method];
    if (!(wIn <= max.w && hIn <= max.h)) out.push({ id: "print-area", severity: "warn", title: `Larger than the standard ${METHOD_LABEL[method].toLowerCase()} area (~${wIn.toFixed(0)} × ${hIn.toFixed(0)} in)`, detail: `Most ${METHOD_LABEL[method].toLowerCase()} tops out around ${max.w} × ${max.h} in. We'll confirm oversize options, or size it down, on your proof.`, short: "over max print size" });
  }
  return out.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
}

export function evaluatePreflight(analysis, { method, printedWidthIn, garmentHex }) {
  const own = findings(analysis, method, printedWidthIn, garmentHex);
  const methodFits = ["screen", "dtg", "embroidery"].map((m) => {
    const f = m === method ? own : findings(analysis, m, printedWidthIn, garmentHex);
    const top = f[0];
    const status = top && top.severity === "fail" ? "avoid" : top && top.severity === "warn" ? "caution" : "ready";
    return { method: m, label: METHOD_LABEL[m], status, note: status === "ready" ? undefined : f.find((x) => x.severity !== "pass")?.short };
  }).sort((a, b) => (a.method === method ? -1 : b.method === method ? 1 : 0));
  const fail = own.find((f) => f.severity === "fail"), warn = own.find((f) => f.severity === "warn");
  const status = fail ? "fix" : warn ? "review" : "ready";
  const facts = [];
  if (analysis.isVector) facts.push("Vector SVG");
  else {
    facts.push(`${analysis.sourceW} × ${analysis.sourceH} px`);
    if (analysis.meta.vectorSource) facts.push(`Vector source (${analysis.meta.vectorSource.toUpperCase()})`);
    else facts.push(`${Math.round(analysis.sourceW / widthIn(printedWidthIn))} DPI at ${widthIn(printedWidthIn).toFixed(1)} in`);
  }
  const s = analysis.stats;
  if (s) {
    facts.push(s.continuousTone ? "Full-color art" : `${s.colorCount} ${s.colorCount === 1 ? "color" : "colors"}`);
    if (s.hasAlpha && !s.solidBackground) facts.push("Transparent background");
    else if (s.solidBackground?.nearWhite) facts.push("White background");
    else if (s.solidBackground) facts.push("Solid background");
  }
  return {
    status, headline: status === "fix" ? `Needs fix: ${fail.short}` : status === "review" ? `Check: ${warn.short}` : "Print ready",
    facts: facts.slice(0, 4), findings: own, methodFits,
    dpi: analysis.isVector ? null : Math.round(analysis.sourceW / widthIn(printedWidthIn)),
    colorCount: s?.colorCount ?? null,
    flags: own.filter((f) => f.severity === "warn" || f.severity === "fail").map((f) => f.short),
  };
}
