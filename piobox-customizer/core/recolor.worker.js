// Module worker: prepares a garment photo off the main thread.
import { prepareGarmentFromRgba } from "./recolor-core.js";

self.onmessage = (e) => {
  const { id, buffer, maskBuffer, sourceAlphaBuffer, width, height, protect } = e.data;
  try {
    const data = new Uint8ClampedArray(buffer);
    const mask = maskBuffer ? new Uint8ClampedArray(maskBuffer) : undefined;
    const srcAlpha = sourceAlphaBuffer ? new Uint8ClampedArray(sourceAlphaBuffer) : undefined;
    const p = prepareGarmentFromRgba(data, width, height, mask, srcAlpha, protect);
    const transfer = [p.luma.buffer, p.alpha.buffer, p.tex.buffer];
    if (p.keep) transfer.push(p.keep.buffer, p.keepRgb.buffer);
    self.postMessage({ id, ok: p.ok, width: p.width, height: p.height, luma: p.luma.buffer, alpha: p.alpha.buffer, tex: p.tex.buffer, keep: p.keep?.buffer, keepRgb: p.keepRgb?.buffer }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
