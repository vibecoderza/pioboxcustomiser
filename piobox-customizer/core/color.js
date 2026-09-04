// Color math shared by the color picker, preflight checks and the garment recolor engine.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function normalizeHex(input) {
  const s = String(input ?? "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  return null;
}

export function hexToRgb(hex) {
  const n = parseInt((normalizeHex(hex) ?? "#000000").slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
}

function mixLinear(a, b, t) {
  return {
    r: linearToSrgb(lerp(srgbToLinear(a.r), srgbToLinear(b.r), t)),
    g: linearToSrgb(lerp(srgbToLinear(a.g), srgbToLinear(b.g), t)),
    b: linearToSrgb(lerp(srgbToLinear(a.b), srgbToLinear(b.b), t)),
  };
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function readableInkOn(hex) {
  const l = relativeLuminance(hex);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}

export function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function deltaE2000(lab1, lab2) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const Lbar = (L1 + L2) / 2;
  const Cbar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + 6103515625)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const Cbarp = (C1p + C2p) / 2;
  const hue = (a, b) => {
    if (a === 0 && b === 0) return 0;
    let h = Math.atan2(b, a) * deg;
    if (h < 0) h += 360;
    return h;
  };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  let Hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) Hbarp += h1p + h2p < 360 ? 360 : -360;
    Hbarp /= 2;
  }
  const SC = 1 + 0.045 * Cbarp;
  const T = 1 - 0.17 * Math.cos((Hbarp - 30) * rad) + 0.24 * Math.cos(2 * Hbarp * rad) + 0.32 * Math.cos((3 * Hbarp + 6) * rad) - 0.2 * Math.cos((4 * Hbarp - 63) * rad);
  const SH = 1 + 0.015 * Cbarp * T;
  const SL = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
  const RT = -(2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + 6103515625))) * Math.sin(2 * (30 * Math.exp(-Math.pow((Hbarp - 275) / 25, 2))) * rad);
  return Math.sqrt(Math.pow((L2 - L1) / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + (dCp / SC) * RT * (dHp / SH));
}

export function hexDeltaE(a, b) {
  return deltaE2000(hexToLab(a), hexToLab(b));
}

export function nearestByDeltaE(hex, entries) {
  if (!entries.length) return null;
  const lab = hexToLab(hex);
  let best = entries[0];
  let bestD = deltaE2000(lab, hexToLab(best.hex));
  for (let i = 1; i < entries.length; i++) {
    const d = deltaE2000(lab, hexToLab(entries[i].hex));
    if (d < bestD) { bestD = d; best = entries[i]; }
  }
  return { entry: best, deltaE: bestD };
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), d = max - Math.min(R, G, B);
  let h = 0;
  if (d !== 0) {
    h = (max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(100 * (max === 0 ? 0 : d / max)), v: Math.round(100 * max) };
}

export function hsvToHex({ h, s, v }) {
  const H = ((h % 360) + 360) % 360;
  const S = clamp(s, 0, 100) / 100, V = clamp(v, 0, 100) / 100;
  const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c;
  let r = 0, g = 0, b = 0;
  if (H < 60) [r, g, b] = [c, x, 0];
  else if (H < 120) [r, g, b] = [x, c, 0];
  else if (H < 180) [r, g, b] = [0, c, x];
  else if (H < 240) [r, g, b] = [0, x, c];
  else if (H < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

// Builds a 256-entry lookup table mapping garment luma → target colour with fabric shading preserved.
const BLACK = { r: 0, g: 0, b: 0 }, WHITE = { r: 255, g: 255, b: 255 };
const SHADE_STOPS = [
  { t: 0, mixWith: BLACK, amount: 0.48 },
  { t: 0.3, mixWith: BLACK, amount: 0.2 },
  { t: 0.5, mixWith: BLACK, amount: 0 },
  { t: 1, mixWith: WHITE, amount: 0.26 },
];
export function buildRecolorLut(hex) {
  const target = hexToRgb(hex);
  // Very dark targets get a little lift so fabric texture stays visible.
  const darkness = clamp(1 - (0.2126 * srgbToLinear(target.r) + 0.7152 * srgbToLinear(target.g) + 0.0722 * srgbToLinear(target.b)) / 0.045, 0, 1);
  const r = new Uint8ClampedArray(256), g = new Uint8ClampedArray(256), b = new Uint8ClampedArray(256);
  const shade = (t) => {
    const base = darkness > 0 ? mixLinear(target, WHITE, 0.018 * darkness) : target;
    const amt = (stop) => (stop.mixWith === WHITE ? stop.amount + 0.14 * darkness : stop.amount);
    if (t <= SHADE_STOPS[0].t) return mixLinear(base, SHADE_STOPS[0].mixWith, amt(SHADE_STOPS[0]));
    for (let i = 1; i < SHADE_STOPS.length; i++) {
      const prev = SHADE_STOPS[i - 1], next = SHADE_STOPS[i];
      if (t <= next.t) {
        const span = next.t - prev.t || 1;
        const k = (t - prev.t) / span;
        return mixLinear(mixLinear(base, prev.mixWith, amt(prev)), mixLinear(base, next.mixWith, amt(next)), k);
      }
    }
    const last = SHADE_STOPS[SHADE_STOPS.length - 1];
    return mixLinear(base, last.mixWith, amt(last));
  };
  for (let i = 0; i < 256; i++) {
    const c = shade(i / 255);
    r[i] = c.r; g[i] = c.g; b[i] = c.b;
  }
  return { r, g, b };
}
