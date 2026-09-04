// Composes garment + layers into PNG mockups (single side, or a side-by-side final preview).
import { STAGE_PAD_FRAC } from "./placements.js";
import { loadImage } from "./artwork.js";

function drawGarment(ctx, img, x, size, mirrored = false, pad = 0) {
  const inner = Math.max(1, size - 2 * pad);
  const k = Math.min(inner / img.naturalWidth, inner / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.save();
  if (mirrored) { ctx.translate(x + size / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + size / 2), 0); }
  ctx.drawImage(img, x + (size - w) / 2, (size - h) / 2, w, h);
  ctx.restore();
}
function drawLayer(ctx, img, layer, x, size) {
  const { artwork, placement } = layer;
  const aspect = artwork.naturalW > 0 && artwork.naturalH > 0 ? artwork.naturalH / artwork.naturalW : 1;
  const w = placement.width * size, h = w * aspect;
  ctx.save();
  if (layer.clipRect) { const c = layer.clipRect; ctx.beginPath(); ctx.rect(x + c.x * size, c.y * size, c.w * size, c.h * size); ctx.clip(); }
  ctx.translate(x + placement.cx * size, placement.cy * size);
  ctx.rotate((placement.rotation * Math.PI) / 180);
  if (placement.flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// One side, 2000×2000, white background. `layers`: [{ artwork, placement, clipRect? }]
export async function composeMockupPng(mockupSrc, layers, { mirrored = false, badge } = {}) {
  try {
    const [garment, arts] = await Promise.all([loadImage(mockupSrc), Promise.all(layers.map((l) => loadImage(l.artwork.url)))]);
    const S = 2000, canvas = document.createElement("canvas"); canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, S, S);
    drawGarment(ctx, garment, 0, S, mirrored, S * STAGE_PAD_FRAC);
    layers.forEach((l, i) => drawLayer(ctx, arts[i], l, 0, S));
    if (badge) {
      ctx.font = "600 60px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const w = ctx.measureText(badge).width + 88, r = 55;
      ctx.beginPath(); ctx.moveTo(70 + r, 70); ctx.arcTo(70 + w, 70, 70 + w, 180, r); ctx.arcTo(70 + w, 180, 70, 180, r); ctx.arcTo(70, 180, 70, 70, r); ctx.arcTo(70, 70, 70 + w, 70, r); ctx.closePath();
      ctx.fillStyle = "rgba(17,17,17,0.85)"; ctx.fill(); ctx.fillStyle = "#ffffff"; ctx.fillText(badge, 114, 126);
    }
    return await new Promise((res) => canvas.toBlob(res, "image/png"));
  } catch { return null; }
}

// All sides with layers, side by side, labelled. `sides`: [{ label, mockupSrc, mirrored, layers }]
export async function composeFinalPreviewPng(sides) {
  const used = sides.filter((s) => s.layers.length > 0);
  if (used.length === 0) return null;
  try {
    const tile = 1600, gap = 48, W = 80 + tile * used.length + gap * (used.length - 1), H = 1704;
    const loaded = await Promise.all(used.map(async (s) => ({ side: s, garment: await loadImage(s.mockupSrc), arts: await Promise.all(s.layers.map((l) => loadImage(l.artwork.url))) })));
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    loaded.forEach(({ side, garment, arts }, i) => {
      const x = 40 + (tile + gap) * i;
      drawGarment(ctx, garment, x, tile, side.mirrored, tile * STAGE_PAD_FRAC);
      side.layers.forEach((l, k) => drawLayer(ctx, arts[k], l, x, tile));
      ctx.fillStyle = "#111111"; ctx.font = "600 30px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(side.label, x + tile / 2, 1672);
    });
    return await new Promise((res) => canvas.toBlob(res, "image/png"));
  } catch { return null; }
}

// Small preview (≤1200px) as a data URL, for share payloads / order attachments.
export async function blobToPreviewDataUrl(blob, maxWidth = 1200, maxChars = 2_100_000) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxWidth / bmp.width), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
    const toBlob = (type, q) => new Promise((res) => canvas.toBlob(res, type, q));
    const webp = await toBlob("image/webp", 0.9);
    const out = webp && webp.type === "image/webp" ? webp : await toBlob("image/png");
    if (!out) return null;
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(out); });
    return !dataUrl || dataUrl.length > maxChars ? null : dataUrl;
  } catch { return null; }
}
