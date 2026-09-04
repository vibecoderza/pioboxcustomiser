// Garment photo recolor engine (pure functions, runs in a Worker or on the main thread).
//
// prepareGarmentFromRgba() segments the garment out of a white-background product photo,
// extracts a shading map (luma), a soft alpha mask and a fabric texture map. Optionally a
// photo of the same garment in black ("mask") sharpens the segmentation, and hardware /
// openings (eyelets, clips, cap inner) can be protected so they keep their original colour.
// recolorPreparedRgba() then maps the shading map through a colour LUT for any hex.

import { buildRecolorLut } from "./color.js";

export const RECOLOR_ALPHA_OUTPUT_CUTOFF = 24;
export const RECOLOR_MAX_EDGE = 1600;

function cornerAverage(data, w, h) {
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const c = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  return [0, 1, 2].map((k) => c.reduce((s, v) => s + v[k], 0) / 4);
}
function distToRef(data, i, ref) {
  const o = 4 * i;
  const dr = data[o] - ref[0], dg = data[o + 1] - ref[1], db = data[o + 2] - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
function bbox(mask, w, h) {
  let left = w, top = h, right = -1, bottom = -1, count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
    count++;
  }
  return count > 0 ? { left, top, right, bottom, count } : null;
}
function majority3x3(mask, w, h) {
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let on = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      n++; if (mask[yy * w + xx] > 0) on++;
    }
    out[y * w + x] = 255 * (2 * on > n);
  }
  return out;
}
// Fill enclosed holes (zero regions not connected to the border).
function fillHoles(mask, w, h) {
  const total = w * h, seen = new Uint8Array(total), stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i] || mask[i] !== 0) return;
    seen[i] = 1; stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  const out = Uint8ClampedArray.from(mask);
  for (let i = 0; i < total; i++) if (mask[i] === 0 && !seen[i]) out[i] = 255;
  return out;
}
// Chamfer distance transform (3-4 metric) from the set pixels.
function distanceTransform(bin, w, h, borderIsZero) {
  const n = w * h, d = new Int32Array(n);
  for (let i = 0; i < n; i++) d[i] = 0x3fffffff * (bin[i] ? 0 : 1);
  if (borderIsZero) {
    for (let x = 0; x < w; x++) { const b = (h - 1) * w + x; if (d[x] > 3) d[x] = 3; if (d[b] > 3) d[b] = 3; }
    for (let y = 0; y < h; y++) { const l = y * w, r = l + w - 1; if (d[l] > 3) d[l] = 3; if (d[r] > 3) d[r] = 3; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
    if (y > 0) {
      if (d[i - w] + 3 < v) v = d[i - w] + 3;
      if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4;
      if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4;
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
    if (y < h - 1) {
      if (d[i + w] + 3 < v) v = d[i + w] + 3;
      if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4;
      if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4;
    }
    d[i] = v;
  }
  return d;
}
function erode(mask, w, h, iterations) {
  let cur = mask;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8ClampedArray(cur.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = cur[y * w + x] > 0;
      for (let dy = -1; dy <= 1 && on; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || cur[yy * w + xx] === 0) { on = false; break; }
      }
      next[y * w + x] = on ? 255 : 0;
    }
    cur = next;
  }
  return cur;
}
function dilate(mask, w, h, iterations) {
  let cur = mask;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8ClampedArray(cur.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = cur[y * w + x] > 0;
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && cur[yy * w + xx] > 0) { on = true; break; }
      }
      next[y * w + x] = on ? 255 : 0;
    }
    cur = next;
  }
  return cur;
}
function boxBlur(src, w, h, radius) {
  const size = 2 * radius + 1;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const cx = (x) => (x < 0 ? 0 : x >= w ? w - 1 : x), cy = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y);
  for (let y = 0; y < h; y++) {
    const row = y * w; let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += src[row + cx(k)];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc / size; acc += src[row + cx(x + radius + 1)] - src[row + cx(x - radius)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += tmp[cy(k) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / size; acc += tmp[cy(y + radius + 1) * w + x] - tmp[cy(y - radius) * w + x]; }
  }
  return out;
}
function softKnee(v, knee, limit) {
  const a = Math.abs(v);
  return limit * Math.tanh((a <= knee ? 0 : Math.sign(v) * (a - knee)) / limit);
}
// Grow values outward from the mask so edge pixels have sensible neighbours.
function inpaintOutward(values, mask, w, h, iterations) {
  const n = w * h, acc = Float32Array.from(values, (v) => v), filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) filled[i] = mask[i] > 0 ? 1 : 0;
  for (let it = 0; it < iterations; it++) {
    const snapshot = filled.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (snapshot[i]) continue;
      let sum = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (snapshot[j]) { sum += acc[j]; cnt++; }
        }
      }
      if (cnt > 0) { acc[i] = sum / cnt; filled[i] = 1; }
    }
  }
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(acc[i]);
  return out;
}
function blur3(values, w, h, horizontal) {
  const out = new Float32Array(values.length);
  if (horizontal) {
    for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) {
      const a = x > 0 ? values[row + x - 1] : values[row + x], b = values[row + x], c = x < w - 1 ? values[row + x + 1] : values[row + x];
      out[row + x] = (a + b + c) / 3;
    } }
  } else {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const a = y > 0 ? values[(y - 1) * w + x] : values[y * w + x], b = values[y * w + x], c = y < h - 1 ? values[(y + 1) * w + x] : values[y * w + x];
      out[y * w + x] = (a + b + c) / 3;
    }
  }
  return out;
}
function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length), stack = [];
  let best = [];
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || mask[s] === 0) continue;
    const comp = [];
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (!seen[j] && mask[j] > 0) { seen[j] = 1; stack.push(j); } } }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8ClampedArray(mask.length);
  for (const i of best) out[i] = 255;
  return out;
}
function dropSmallComponents(mask, w, h) {
  const n = w * h, minSize = Math.max(24, Math.round(4e-4 * n));
  const seen = new Uint8Array(n), stack = [], comp = [], out = Uint8ClampedArray.from(mask);
  for (let s = 0; s < n; s++) {
    if (seen[s] || mask[s] === 0) continue;
    comp.length = 0; stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (!seen[j] && mask[j] > 0) { seen[j] = 1; stack.push(j); } } }
    }
    if (comp.length <= minSize) for (const i of comp) out[i] = 0;
  }
  return out;
}
// Remove large white regions inside the mask (e.g. background showing through arm gaps).
function carveBackgroundPockets(mask, data, w, h) {
  const n = w * h, ref = cornerAverage(data, w, h);
  const isBg = (i) => { const o = 4 * i; const dr = data[o] - ref[0], dg = data[o + 1] - ref[1], db = data[o + 2] - ref[2]; return Math.sqrt(dr * dr + dg * dg + db * db) < 5; };
  const minPixels = Math.max(64, Math.round(6e-4 * n)), minDepth = Math.max(6, Math.round(0.017 * Math.max(w, h)));
  const out = Uint8ClampedArray.from(mask), seen = new Uint8Array(n), inComp = new Uint8Array(n), stack = [], comp = [];
  const depthOf = () => {
    const dist = new Int32Array(comp.length).fill(-1), idx = new Map();
    for (let k = 0; k < comp.length; k++) idx.set(comp[k], k);
    const queue = [];
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % w, y = (i / w) | 0;
      const interior = x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1 && inComp[i - 1] && inComp[i + 1] && inComp[i - w] && inComp[i + w];
      if (!interior) { dist[k] = 1; queue.push(k); }
    }
    let maxD = 1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = comp[k], dcur = dist[k];
      if (dcur > maxD) maxD = dcur;
      if (maxD >= minDepth) break;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1]) {
        if (j < 0 || !inComp[j]) continue;
        const kk = idx.get(j);
        if (dist[kk] === -1) { dist[kk] = dcur + 1; queue.push(kk); }
      }
    }
    return maxD;
  };
  for (let s = 0; s < n; s++) {
    if (seen[s] || out[s] === 0 || !isBg(s)) continue;
    comp.length = 0; stack.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i); inComp[i] = 1;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1])
        if (j >= 0 && !seen[j] && out[j] !== 0 && isBg(j)) { seen[j] = 1; stack.push(j); }
    }
    if (comp.length >= minPixels && depthOf() >= minDepth) for (const i of comp) out[i] = 0;
    for (const i of comp) inComp[i] = 0;
  }
  return out;
}
// Re-add small bright pockets that sit deep inside the silhouette (they are garment, not background).
function reclaimInnerPockets(mask, data, w, h) {
  const n = w * h, threshold = 3 * Math.max(10, Math.round(0.019 * Math.max(w, h)));
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = mask[i] > 0 ? 1 : 0;
  const dOut = distanceTransform(bin, w, h, false);
  const far = new Uint8Array(n);
  for (let i = 0; i < n; i++) far[i] = dOut[i] <= threshold ? 0 : 1;
  const dIn = distanceTransform(far, w, h, true);
  const ref = cornerAverage(data, w, h), refLuma = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
  const maxPixels = Math.max(64, Math.round(8e-4 * n));
  const out = Uint8ClampedArray.from(mask), seen = new Uint8Array(n), stack = [], comp = [];
  const candidate = (i) => !bin[i] && dIn[i] > threshold;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !candidate(s)) continue;
    comp.length = 0; stack.length = 0; stack.push(s); seen[s] = 1;
    let bright = 0;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const o = 4 * i;
      if (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2] >= refLuma - 14) bright++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1])
        if (j >= 0 && !seen[j] && candidate(j)) { seen[j] = 1; stack.push(j); }
    }
    if (comp.length <= maxPixels && bright >= 0.8 * comp.length) for (const i of comp) out[i] = 255;
  }
  return out;
}
function trimBackgroundEdge(mask, data, w, h) {
  const ref = cornerAverage(data, w, h);
  let cur = Uint8ClampedArray.from(mask);
  for (let it = 0; it < 2; it++) {
    const next = Uint8ClampedArray.from(cur);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cur[i] === 0 || distToRef(data, i, ref) >= 10) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || cur[i - 1] === 0 || cur[i + 1] === 0 || cur[i - w] === 0 || cur[i + w] === 0) next[i] = 0;
    }
    cur = next;
  }
  return cur;
}
// Segment using the black-garment reference photo when available.
function darkMaskFromReference(maskData, w, h) {
  const n = w * h, ref = cornerAverage(maskData, w, h);
  const refLuma = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
  const dark = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = 4 * i;
    if (refLuma - (0.2126 * maskData[o] + 0.7152 * maskData[o + 1] + 0.0722 * maskData[o + 2]) >= 55 && distToRef(maskData, i, ref) >= 60) dark[i] = 255;
  }
  return largestComponent(dark, w, h);
}
function alignReferenceMask(darkMask, maskData, whiteMask, w, h) {
  const a = bbox(whiteMask, w, h), b = bbox(darkMask, w, h), n = w * h;
  if (!a || !b || a.count / n < 0.08 || a.count / n > 0.92) return null;
  const aw = Math.max(1, a.right - a.left), ah = Math.max(1, a.bottom - a.top);
  const bw = Math.max(1, b.right - b.left);
  const shadowRows = Math.max(2, Math.round(0.003 * Math.max(w, h)));
  const bBottom = Math.max(b.top + 1, b.bottom - shadowRows), bh = Math.max(1, bBottom - b.top);
  if (Math.abs(Math.log(aw / ah / (bw / bh))) > 0.28) return null;
  const alpha = new Uint8ClampedArray(n), data = new Uint8ClampedArray(4 * n).fill(255);
  for (let y = b.top; y <= bBottom; y++) {
    const sy = Math.round(a.top + ((y - b.top) / bh) * ah);
    for (let x = b.left; x <= b.right; x++) {
      const si = sy * w + Math.round(a.left + ((x - b.left) / bw) * aw), di = y * w + x;
      alpha[di] = darkMask[si];
      const so = 4 * si, doff = 4 * di;
      data[doff] = maskData[so]; data[doff + 1] = maskData[so + 1]; data[doff + 2] = maskData[so + 2]; data[doff + 3] = maskData[so + 3];
    }
  }
  const grown = dilate(whiteMask, w, h, 2);
  for (let i = 0; i < n; i++) if (grown[i] === 0) alpha[i] = 0;
  return { alpha, data };
}
// Cap / hat inner openings: dark neutral pockets fully enclosed by the garment keep their colour.
function protectOpenings(mask, data, w, h) {
  const n = w * h, minPixels = Math.max(64, Math.round(0.0015 * n)), maxPixels = Math.round(0.25 * n), minDepth = Math.max(6, Math.round(0.02 * Math.max(w, h)));
  const isDarkNeutral = (i) => { const o = 4 * i, r = data[o], g = data[o + 1], b = data[o + 2]; return !(Math.max(r, g, b) - Math.min(r, g, b) > 14) && 0.2126 * r + 0.7152 * g + 0.0722 * b <= 195; };
  const seen = new Uint8Array(n), inComp = new Uint8Array(n), openings = new Uint8ClampedArray(n), comp = [], stack = [];
  let found = false;
  const depthOf = () => {
    const dist = new Int32Array(comp.length).fill(-1), idx = new Map();
    for (let k = 0; k < comp.length; k++) idx.set(comp[k], k);
    const queue = [];
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % w, y = (i / w) | 0;
      const interior = x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1 && inComp[i - 1] && inComp[i + 1] && inComp[i - w] && inComp[i + w];
      if (!interior) { dist[k] = 1; queue.push(k); }
    }
    let maxD = 1;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = comp[k], dcur = dist[k];
      if (dcur > maxD) maxD = dcur;
      if (maxD >= minDepth) break;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1]) {
        if (j < 0 || !inComp[j]) continue;
        const kk = idx.get(j);
        if (dist[kk] === -1) { dist[kk] = dcur + 1; queue.push(kk); }
      }
    }
    return maxD;
  };
  for (let s = 0; s < n; s++) {
    if (seen[s] || mask[s] === 0 || !isDarkNeutral(s)) continue;
    comp.length = 0; stack.length = 0; stack.push(s); seen[s] = 1;
    let touchesOutside = false;
    while (stack.length) {
      const i = stack.pop(); comp.push(i); inComp[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesOutside = true;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1]) {
        if (j < 0) continue;
        if (mask[j] === 0) { touchesOutside = true; continue; }
        if (!seen[j] && isDarkNeutral(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!touchesOutside && comp.length >= minPixels && comp.length <= maxPixels && depthOf() >= minDepth) { found = true; for (const i of comp) openings[i] = 255; }
    for (const i of comp) inComp[i] = 0;
  }
  if (!found) return mask;
  const edge = Math.max(w, h);
  const erodeR = Math.max(1, Math.round(0.0024 * edge)), growSteps = Math.max(4, Math.round(0.035 * edge));
  const closeR = Math.max(1, Math.round(0.007 * edge)), padR = Math.max(1, Math.round(0.004 * edge));
  const eroded = erode(mask, w, h, erodeR);
  const grown = Uint8ClampedArray.from(openings);
  let frontier = [];
  for (let i = 0; i < n; i++) if (grown[i] !== 0) frontier.push(i);
  for (let step = 0; step < growSteps && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % w, y = (i / w) | 0;
      for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1]) {
        if (j < 0 || grown[j] !== 0 || mask[j] === 0 || eroded[j] === 0) continue;
        const o = 4 * j, r = data[o], g = data[o + 1], b = data[o + 2];
        if (!(Math.max(r, g, b) - Math.min(r, g, b) > 18) && !(0.2126 * r + 0.7152 * g + 0.0722 * b > 235)) { grown[j] = 255; next.push(j); }
      }
    }
    frontier = next;
  }
  let closed = dilate(erode(grown, w, h, closeR), w, h, closeR);
  for (let i = 0; i < n; i++) if (openings[i] !== 0) closed[i] = 255;
  const padded = dilate(closed, w, h, padR);
  const out = Uint8ClampedArray.from(mask);
  for (let i = 0; i < n; i++) if (padded[i] !== 0) out[i] = 0;
  return out;
}
// Metal hardware (clips, pins): high-contrast neutral regions keep their original pixels.
function detectHardware(mask, data, luma, w, h) {
  const n = w * h, r = Math.max(2, Math.round(0.006 * Math.max(w, h)));
  const minMax = (() => {
    const mn = new Uint8ClampedArray(n), mx = new Uint8ClampedArray(n);
    for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) {
      let lo = 255, hi = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = luma[row + k]; if (v < lo) lo = v; if (v > hi) hi = v; }
      mn[row + x] = lo; mx[row + x] = hi;
    } }
    const mn2 = new Uint8ClampedArray(n), mx2 = new Uint8ClampedArray(n);
    for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) { let lo = 255, hi = 0;
        for (let k = y0; k <= y1; k++) { const i = k * w + x; if (mn[i] < lo) lo = mn[i]; if (mx[i] > hi) hi = mx[i]; }
        mn2[y * w + x] = lo; mx2[y * w + x] = hi; } }
    return { min: mn2, max: mx2 };
  })();
  const neutral = (i) => { const o = 4 * i; return Math.max(data[o], data[o + 1], data[o + 2]) - Math.min(data[o], data[o + 1], data[o + 2]) <= 22; };
  const seed = new Uint8ClampedArray(n), seen = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (mask[i] !== 0 && minMax.max[i] - minMax.min[i] >= 90 && minMax.min[i] <= 140 && neutral(i)) { seen[i] = 1; seed[i] = 255; stack.push(i); }
  if (!stack.length) return null;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (const j of [x + 1 < w ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < h ? i + w : -1, y - 1 >= 0 ? i - w : -1])
      if (j >= 0 && !seen[j] && mask[j] !== 0 && minMax.min[j] <= 165 && minMax.max[j] - minMax.min[j] >= 35 && neutral(j)) { seen[j] = 1; seed[j] = 255; stack.push(j); }
  }
  let hw = fillHoles(seed, w, h);
  hw = fillHoles(erode(dilate(hw, w, h, 2), w, h, 1), w, h);
  let hwCount = 0, maskCount = 0;
  for (let i = 0; i < n; i++) { if (hw[i] !== 0) hwCount++; if (mask[i] !== 0) maskCount++; }
  if (!hwCount || !maskCount || hwCount / maskCount > 0.2) return null;
  // Soften the keep-mask edges.
  const tmp = new Uint16Array(n), out = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = Math.max(0, x - 1); k <= Math.min(w - 1, x + 1); k++) { s += hw[row + k]; c++; } tmp[row + x] = Math.round(s / c); } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = Math.max(0, y - 1); k <= Math.min(h - 1, y + 1); k++) { s += tmp[k * w + x]; c++; } out[y * w + x] = Math.round(s / c); }
  return out;
}

function buildToneMaps(luma, mask, w, h) {
  const n = w * h;
  // Smooth luma inside the mask.
  const smooth = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i] === 0) { smooth[i] = luma[i]; continue; }
    let s = 0, c = 0;
    for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const j = yy * w + xx; if (mask[j] !== 0) { s += luma[j]; c++; } } }
    smooth[i] = c > 0 ? Math.round(s / c) : luma[i];
  }
  const hist = new Int32Array(256); let count = 0;
  for (let i = 0; i < n; i++) if (mask[i] > 0) { hist[smooth[i]]++; count++; }
  let median = 200;
  if (count > 0) { const target = 0.6 * count; let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) { median = v; break; } } }
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) field[i] = mask[i] > 0 ? smooth[i] : median;
  const wide = boxBlur(field, w, h, 45), mid = boxBlur(field, w, h, 14);
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) continue;
    shade[i] = 1.9 * (wide[i] - median) + 2.4 * softKnee(mid[i] - wide[i], 4, 44) + 2.2 * softKnee(smooth[i] - mid[i], 6, 36);
  }
  const hist2 = new Int32Array(512); let solid = 0;
  for (let i = 0; i < n; i++) { if (mask[i] < 250) continue; hist2[Math.max(-256, Math.min(255, Math.round(shade[i]))) + 256]++; solid++; }
  let lowPct = 0;
  if (solid > 0) { const target = 0.04 * solid; let acc = 0; for (let v = 0; v < 512; v++) { acc += hist2[v]; if (acc >= target) { lowPct = v - 256; break; } } }
  const gain = Math.min(3, Math.max(1, 46 / Math.max(8, -lowPct)));
  const tone = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    if (mask[i] === 0) { tone[i] = smooth[i]; continue; }
    let t = 0.5 + (112 * Math.tanh(((shade[i] < 0 ? gain : 1 + (gain - 1) * 0.55) * shade[i]) / 112)) / 255;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    tone[i] = Math.round(255 * t);
  }
  return { tone, seamLow: mid };
}

export function prepareGarmentFromRgba(data, w, h, maskData, sourceAlpha, protect) {
  const total = w * h;
  // 1. Background flood from the corners (white sweep).
  const whiteMask = (() => {
    const out = new Uint8ClampedArray(total).fill(255), seen = new Uint8Array(total), stack = [], ref = cornerAverage(data, w, h);
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x; if (seen[i]) return; seen[i] = 1;
      const o = 4 * i, dr = data[o] - ref[0], dg = data[o + 1] - ref[1], db = data[o + 2] - ref[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) < 5) { out[i] = 0; stack.push(i); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) { const i = stack.pop(), x = i % w, y = (i / w) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    return out;
  })();
  // 2. Optional black-reference segmentation.
  const aligned = maskData?.length === data.length ? alignReferenceMask(darkMaskFromReference(maskData, w, h), maskData, whiteMask, w, h) : null;
  const hasRef = aligned != null;
  let mask = aligned?.alpha ?? whiteMask;
  mask = majority3x3(mask, w, h); mask = majority3x3(mask, w, h);
  if (!hasRef) mask = carveBackgroundPockets(fillHoles(mask, w, h), data, w, h);
  mask = dropSmallComponents(mask, w, h);
  if (!hasRef) mask = reclaimInnerPockets(mask, data, w, h);
  if (hasRef) mask = dilate(erode(mask, w, h, 2), w, h, 2);
  mask = largestComponent(trimBackgroundEdge(erode(dilate(mask, w, h, 2), w, h, 3), aligned?.data ?? data, w, h), w, h);
  if (protect?.openings) mask = protectOpenings(mask, data, w, h);
  const finalMask = mask;
  // 3. Luma + tone maps.
  const luma = new Uint8ClampedArray(total); let kept = 0;
  for (let i = 0; i < total; i++) { const o = 4 * i; luma[i] = Math.round(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]); if (mask[i] > 0) kept++; }
  const keptFrac = kept / total;
  const { tone, seamLow } = buildToneMaps(luma, mask, w, h);
  const texture = (() => {
    const out = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i++) {
      if (mask[i] === 0) { out[i] = 128; continue; }
      let t = Math.pow(luma[i] / Math.max(1, seamLow[i]), 1.75);
      t = t < 0.5 ? 0.5 : t > 1.5 ? 1.5 : t;
      out[i] = Math.round(128 * t);
    }
    return out;
  })();
  const lumaOut = inpaintOutward(tone, finalMask, w, h, 5);
  const texOut = inpaintOutward(texture, finalMask, w, h, 5);
  const alphaOut = (() => {
    let f = new Float32Array(total);
    for (let i = 0; i < total; i++) f[i] = finalMask[i] > 0 ? 1 : 0;
    f = blur3(f, w, h, true); f = blur3(f, w, h, false);
    const out = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i++) { const e = Math.max(0, Math.min(1, (f[i] - 0.25) / 0.5)); out[i] = Math.round(255 * (e * e * (3 - 2 * e))); }
    return out;
  })();
  let keep, keepRgb;
  if (protect?.hardware) {
    const hw = detectHardware(finalMask, data, luma, w, h);
    if (hw) {
      keep = hw; keepRgb = new Uint8ClampedArray(3 * total);
      for (let i = 0; i < total; i++) { if (hw[i] === 0) continue; const o = 4 * i, k = 3 * i; keepRgb[k] = data[o]; keepRgb[k + 1] = data[o + 1]; keepRgb[k + 2] = data[o + 2]; }
    }
  }
  return { width: w, height: h, luma: lumaOut, alpha: alphaOut, tex: texOut, ok: keptFrac > 0.08 && keptFrac < 0.92, ...(keep && keepRgb ? { keep, keepRgb } : {}) };
}

export function recolorPreparedRgba(prepared, hex) {
  const { width: w, height: h, luma, alpha, tex, keep, keepRgb } = prepared;
  const out = new Uint8ClampedArray(w * h * 4), lut = buildRecolorLut(hex);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i], o = 4 * i;
    if (a < RECOLOR_ALPHA_OUTPUT_CUTOFF) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    const l = luma[i]; let t = tex[i];
    if (a < 48) t = Math.round(128 + (a / 48) * (t - 128));
    let r = (lut.r[l] * t) >> 7, g = (lut.g[l] * t) >> 7, b = (lut.b[l] * t) >> 7;
    const k = keep?.[i] ?? 0;
    if (k > 0 && keepRgb) { const e = 3 * i; r = Math.round(r + ((keepRgb[e] - r) * k) / 255); g = Math.round(g + ((keepRgb[e + 1] - g) * k) / 255); b = Math.round(b + ((keepRgb[e + 2] - b) * k) / 255); }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}

export function downscalePrepared(prepared, maxEdge) {
  const { width: w, height: h, luma, alpha, tex, keep, keepRgb } = prepared;
  const edge = Math.max(w, h);
  if (!(maxEdge > 0) || edge <= maxEdge) return prepared;
  const s = maxEdge / edge, nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s)), n = nw * nh;
  const aSum = new Float64Array(n), lSum = new Float64Array(n), tSum = new Float64Array(n), cnt = new Int32Array(n);
  const hasKeep = keep && keepRgb, kSum = hasKeep ? new Float64Array(n) : null, kRgb = hasKeep ? new Float64Array(3 * n) : null;
  for (let y = 0; y < h; y++) {
    const row = Math.min(nh - 1, ((y * nh) / h) | 0) * nw, src = y * w;
    for (let x = 0; x < w; x++) {
      const d = row + Math.min(nw - 1, ((x * nw) / w) | 0), i = src + x, a = alpha[i];
      aSum[d] += a; lSum[d] += luma[i] * a; tSum[d] += tex[i] * a; cnt[d]++;
      if (kSum && kRgb) { const k = keep[i]; kSum[d] += k; if (k > 0) { const e = 3 * i, f = 3 * d; kRgb[f] += keepRgb[e] * k; kRgb[f + 1] += keepRgb[e + 1] * k; kRgb[f + 2] += keepRgb[e + 2] * k; } }
    }
  }
  const alphaO = new Uint8ClampedArray(n), lumaO = new Uint8ClampedArray(n), texO = new Uint8ClampedArray(n);
  const keepO = kSum ? new Uint8ClampedArray(n) : undefined, keepRgbO = kRgb ? new Uint8ClampedArray(3 * n) : undefined;
  for (let i = 0; i < n; i++) {
    const a = aSum[i];
    alphaO[i] = Math.round(a / (cnt[i] || 1)); lumaO[i] = a > 0 ? Math.round(lSum[i] / a) : 0; texO[i] = a > 0 ? Math.round(tSum[i] / a) : 128;
    if (keepO && keepRgbO && kSum && kRgb) { const k = kSum[i]; keepO[i] = Math.round(k / (cnt[i] || 1)); if (k > 0) { const f = 3 * i; keepRgbO[f] = Math.round(kRgb[f] / k); keepRgbO[f + 1] = Math.round(kRgb[f + 1] / k); keepRgbO[f + 2] = Math.round(kRgb[f + 2] / k); } }
  }
  return { ...prepared, width: nw, height: nh, luma: lumaO, alpha: alphaO, tex: texO, ...(keepO && keepRgbO ? { keep: keepO, keepRgb: keepRgbO } : {}) };
}
