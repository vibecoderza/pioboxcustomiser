// Text layers are rasterised to transparent PNGs so they behave exactly like uploaded artwork
// (same drag / resize / rotate / compose path). Supports multi-line, letter spacing, arch and outline.

export const TEXT_PLACEHOLDER = "Your text";
export const TEXT_MAX_CHARS = 120;
export const INK_COLORS = [
  { id: "white", label: "White", hex: "#FFFFFF" },
  { id: "black", label: "Black", hex: "#111111" },
  { id: "navy", label: "Navy", hex: "#1E2A45" },
  { id: "royal", label: "Royal blue", hex: "#1D4ED8" },
  { id: "red", label: "Red", hex: "#C8102E" },
  { id: "gold", label: "Gold", hex: "#F2A900" },
  { id: "forest", label: "Forest", hex: "#115740" },
  { id: "silver", label: "Silver", hex: "#A2AAAD" },
];
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const isTextEmpty = (t) => t.content.trim().length === 0;

export function sanitizeTextSpec(raw, registry) {
  if (!raw || typeof raw !== "object" || typeof raw.content !== "string") return null;
  return {
    content: raw.content.slice(0, TEXT_MAX_CHARS),
    fontId: registry.get(typeof raw.fontId === "string" ? raw.fontId : undefined).id,
    color: typeof raw.color === "string" && HEX6.test(raw.color) ? raw.color : "#111111",
    spacing: typeof raw.spacing === "number" && Number.isFinite(raw.spacing) ? clamp(raw.spacing, 0, 0.4) : undefined,
    arc: typeof raw.arc === "number" && Number.isFinite(raw.arc) ? clamp(raw.arc, -1, 1) : undefined,
    outline: typeof raw.outline === "string" && HEX6.test(raw.outline) ? raw.outline : undefined,
  };
}

function measureChars(ctx, text, spacing) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  return { chars, widths, width: widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1) };
}
function paintText(ctx, text, x, y, style) {
  if (style.outline) { ctx.strokeStyle = style.outline; ctx.lineWidth = style.outlinePx; ctx.lineJoin = "round"; ctx.strokeText(text, x, y); }
  ctx.fillStyle = style.fill; ctx.fillText(text, x, y);
}
function paintArched(ctx, measured, spacing, cx, baseline, arc, style) {
  const angle = Math.abs(arc) * Math.PI, radius = measured.width / angle, dir = arc > 0 ? 1 : -1;
  let cursor = -measured.width / 2;
  for (let i = 0; i < measured.chars.length; i++) {
    const ch = measured.chars[i], w = measured.widths[i];
    if (ch.trim() !== "") {
      const t = (cursor + w / 2) / radius;
      ctx.save();
      ctx.translate(cx + radius * Math.sin(t), baseline + dir * radius * (1 - Math.cos(t)));
      ctx.rotate(dir * t);
      paintText(ctx, ch, 0, 0, style);
      ctx.restore();
    }
    cursor += w + spacing;
  }
}
function contentBounds(canvas) {
  const ctx = canvas.getContext("2d"), { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] <= 8) continue;
    if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
  }
  return r < 0 ? null : { x: l, y: t, w: r - l + 1, h: b - t + 1 };
}

// Renders a text spec { content, fontId, color, spacing?, arc?, outline? } to an artwork object.
export async function renderTextLayer(spec, registry) {
  const font = registry.get(spec.fontId);
  const empty = isTextEmpty(spec);
  let lines = (empty ? TEXT_PLACEHOLDER : spec.content).replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) lines.push(TEXT_PLACEHOLDER);
  const spacing = empty ? 0 : clamp(spec.spacing ?? 0, 0, 0.4);
  const arc = empty ? 0 : clamp(spec.arc ?? 0, -1, 1);
  const outline = empty ? undefined : spec.outline;
  const family = registry.canvasFamily(spec.fontId);
  const fontString = (px) => `${font.weight} ${px}px ${family}`;
  try { await document.fonts.load(fontString(64), lines.join(" ") || TEXT_PLACEHOLDER); } catch { /* fallback face */ }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  const size = (px) => {
    ctx.font = fontString(px);
    const sp = spacing * px;
    const widest = Math.max(1, ...lines.map((l) => (l ? measureChars(ctx, l, sp).width : 0)));
    const angle = Math.abs(arc) * Math.PI;
    const sagitta = angle > 0.02 ? (widest / angle) * (1 - Math.cos(angle / 2)) : 0;
    return { width: Math.ceil(widest + 2 * px), height: Math.ceil(2.5 * px + 1.18 * px * (lines.length - 1) + 2 * sagitta), sagitta };
  };
  let px = 400, dims = size(px);
  const over = Math.max(dims.width / 3200, dims.height / 3200);
  if (over > 1) { px = Math.max(24, Math.floor(px / over)); dims = size(px); }
  canvas.width = dims.width; canvas.height = dims.height;
  ctx.font = fontString(px); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  const style = { fill: empty ? "#9AA1AC" : spec.color, outline, outlinePx: Math.max(2, 0.08 * px) };
  const sp = spacing * px, arched = Math.abs(arc) > 0.02, firstBaseline = 1.25 * px + dims.sagitta;
  lines.forEach((line, i) => {
    if (line === "") return;
    const y = firstBaseline + 1.18 * px * i;
    if (arched) paintArched(ctx, measureChars(ctx, line, sp), sp, canvas.width / 2, y, arc, style);
    else {
      const prev = ctx.letterSpacing;
      if (sp > 0 && "letterSpacing" in ctx) ctx.letterSpacing = `${sp}px`;
      paintText(ctx, line, canvas.width / 2, y, style);
      if ("letterSpacing" in ctx) ctx.letterSpacing = prev;
    }
  });
  const bounds = contentBounds(canvas);
  if (!bounds) throw new Error("Failed to render text");
  const pad = Math.ceil(0.02 * Math.max(bounds.w, bounds.h)) + 2;
  const x = Math.max(0, bounds.x - pad), y = Math.max(0, bounds.y - pad);
  const w = Math.min(canvas.width - x, bounds.w + 2 * pad), h = Math.min(canvas.height - y, bounds.h + 2 * pad);
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const blob = await new Promise((res) => out.toBlob(res, "image/png"));
  if (!blob) throw new Error("Failed to render text");
  const slug = lines[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "text";
  const file = new File([blob], `text-${slug}.png`, { type: "image/png" });
  return { file, url: URL.createObjectURL(file), naturalW: w, naturalH: h, isVector: false };
}

// "Start from" starters: each layer is a text spec + placement on the front of an apparel top.
export const TEXT_STARTERS = [
  { id: "varsity-arch", label: "Varsity arch", fontId: "varsity", layers: [
    { text: { content: "YOUR CITY", fontId: "varsity", arc: 0.55, spacing: 0.08 }, cx: 0.5, cy: 0.4, width: 0.4 },
    { text: { content: "EST. 2026", fontId: "modern", spacing: 0.3 }, cx: 0.5, cy: 0.495, width: 0.17 } ] },
  { id: "badge", label: "Badge", fontId: "varsity", layers: [
    { text: { content: "YOUR BRAND", fontId: "varsity", arc: 0.62, spacing: 0.1 }, cx: 0.5, cy: 0.35, width: 0.34 },
    { text: { content: "2026", fontId: "impact", spacing: 0.06 }, cx: 0.5, cy: 0.435, width: 0.11 },
    { text: { content: "SINCE DAY ONE", fontId: "varsity", arc: -0.62, spacing: 0.1 }, cx: 0.5, cy: 0.5, width: 0.34 } ] },
  { id: "team-number", label: "Team number", fontId: "impact", layers: [
    { text: { content: "YOUR TEAM", fontId: "impact", spacing: 0.16 }, cx: 0.5, cy: 0.335, width: 0.24 },
    { text: { content: "01", fontId: "impact" }, cx: 0.5, cy: 0.468, width: 0.16 } ] },
  { id: "wordmark", label: "Wordmark", fontId: "modern", layers: [{ text: { content: "YOUR BRAND", fontId: "modern", spacing: 0.24 }, cx: 0.5, cy: 0.42, width: 0.34 }] },
  { id: "mono-tag", label: "Mono tag", fontId: "mono", layers: [
    { text: { content: "YOUR TEAM", fontId: "mono", spacing: 0.26 }, cx: 0.5, cy: 0.395, width: 0.3 },
    { text: { content: "SHIP FAST", fontId: "mono", spacing: 0.26 }, cx: 0.5, cy: 0.45, width: 0.2 } ] },
  { id: "coordinates", label: "Coordinates", fontId: "mono", layers: [{ text: { content: "37.7749° N\n122.4194° W", fontId: "mono", spacing: 0.18 }, cx: 0.5, cy: 0.42, width: 0.24 }] },
  { id: "heritage", label: "Heritage", fontId: "serif", layers: [
    { text: { content: "Your Brand", fontId: "serif", spacing: 0.02 }, cx: 0.5, cy: 0.4, width: 0.34 },
    { text: { content: "EST. 2026", fontId: "mono", spacing: 0.3 }, cx: 0.5, cy: 0.478, width: 0.17 } ] },
  { id: "monogram", label: "Monogram", fontId: "serif", layers: [{ text: { content: "YB", fontId: "serif", spacing: 0.06 }, cx: 0.5, cy: 0.42, width: 0.16 }] },
  { id: "script", label: "Script", fontId: "script", layers: [{ text: { content: "your brand", fontId: "script" }, cx: 0.5, cy: 0.42, width: 0.3 }] },
  { id: "statement", label: "Statement", fontId: "impact", layers: [{ text: { content: "BOLD\nMOVES", fontId: "impact", spacing: 0.02 }, cx: 0.5, cy: 0.43, width: 0.3 }] },
  { id: "repeat", label: "Repeat", fontId: "modern", layers: [{ text: { content: "YOUR BRAND\nYOUR BRAND\nYOUR BRAND", fontId: "modern", spacing: 0.12 }, cx: 0.5, cy: 0.42, width: 0.36 }] },
];
