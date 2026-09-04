// Finding the garment's bounding box inside a product photo.
//
// The studio maps every print zone through this box, so getting it right is what makes the print
// area land on the actual garment rather than near it.
//
// The hard part is that these are white garments on white backgrounds: the garment differs from
// the background by only a few levels of grey, so a fixed threshold either finds nothing or
// finds the whole frame. Instead we measure each pixel's deviation from the sampled background
// and then look at row and column *profiles* — a row belongs to the garment when enough of its
// pixels deviate, which ignores stray specks and JPEG noise without needing a lucky threshold.

export type Frame = { w: number; h: number; cx: number; cy: number; ar: number };
export type DetectResult =
  | { ok: true; frame: Frame }
  | { ok: false; reason: "unreadable" | "not-found" };

/** A row/column counts as garment when this share of its pixels deviate from the background. */
const PROFILE_SHARE = 0.012;
/** Deviation in 0-255 that counts as "not background". Low, because white-on-white is subtle. */
const DEVIATION = 7;
/** Below this the detection is noise, not a garment. */
const MIN_COVERAGE = 0.03;

export async function detectFrame(url: string): Promise<DetectResult> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  // The box only needs sub-percent accuracy, so a 512px pass is plenty and ~40x cheaper.
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: "unreadable" };
  ctx.drawImage(img, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return { ok: false, reason: "unreadable" }; // tainted canvas: the host sent no CORS headers
  }

  // Average several edge samples rather than one corner, so a vignette or shadow cannot define
  // "background" by itself.
  const samples: number[][] = [];
  const edge = (x: number, y: number) => { const i = (y * w + x) * 4; samples.push([data[i], data[i + 1], data[i + 2]]); };
  for (const fx of [0.02, 0.5, 0.98]) { edge(Math.round(fx * (w - 1)), 0); edge(Math.round(fx * (w - 1)), h - 1); }
  for (const fy of [0.02, 0.5, 0.98]) { edge(0, Math.round(fy * (h - 1))); edge(w - 1, Math.round(fy * (h - 1))); }
  const bg = [0, 1, 2].map((c) => median(samples.map((s) => s[c])));

  const rows = new Int32Array(h);
  const cols = new Int32Array(w);
  let hits = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 24) continue;
      const d = Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
      if (d <= DEVIATION) continue;
      rows[y]++; cols[x]++; hits++;
    }
  }
  if (hits / (w * h) < MIN_COVERAGE) return { ok: false, reason: "not-found" };

  const [minY, maxY] = span(rows, Math.max(2, Math.round(w * PROFILE_SHARE)));
  const [minX, maxX] = span(cols, Math.max(2, Math.round(h * PROFILE_SHARE)));
  if (maxX <= minX || maxY <= minY) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    frame: {
      w: round((maxX - minX + 1) / w),
      h: round((maxY - minY + 1) / h),
      cx: round((minX + (maxX - minX + 1) / 2) / w),
      cy: round((minY + (maxY - minY + 1) / 2) / h),
      ar: round(img.naturalWidth / img.naturalHeight),
    },
  };
}

/** First and last index whose count clears the threshold. */
function span(profile: Int32Array, min: number): [number, number] {
  let lo = -1, hi = -1;
  for (let i = 0; i < profile.length; i++) if (profile[i] >= min) { lo = i; break; }
  for (let i = profile.length - 1; i >= 0; i--) if (profile[i] >= min) { hi = i; break; }
  return [lo, hi];
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const round = (v: number) => Math.round(v * 10000) / 10000;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Photo frames are keyed by bare filename, matching how the studio looks them up. */
export function photoKey(url: string) {
  return url.split("?")[0].split("/").pop() ?? url;
}
