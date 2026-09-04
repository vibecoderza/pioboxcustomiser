// Pantone reference library helpers + garment colour "selection" model.
//
// A selection is one of:
//   { kind: "stocked", color: { id, name, hex } }          – a real stocked colourway of the product (has its own photo)
//   { kind: "pantone", color: { id, code, name, hex, family } }
//   { kind: "custom",  hex }
import { PANTONE_LIBRARY, PANTONE_FAMILIES } from "../data/pantone.js";
import { normalizeHex, nearestByDeltaE } from "./color.js";

export { PANTONE_FAMILIES };

export function canonicalPantoneId(code) {
  const t = code.trim().toUpperCase();
  const tcx = t.match(/^(\d{2})-(\d{4})\s+(TCX|TPG|TPX)$/);
  if (tcx) return `pantone-reference:${tcx[3].toLowerCase()}:${tcx[1]}-${tcx[2]}`;
  const solid = t.match(/^PANTONE\s+(\d{2,4})\s+([CU])$/);
  if (solid) return `pantone-reference:${solid[2].toLowerCase()}:${solid[1]}`;
  return `pantone-reference:invalid:${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export const PANTONE_COLORS = PANTONE_LIBRARY.map((c) => ({ ...c, id: canonicalPantoneId(c.code), aliases: c.aliases ?? [] }));
export const PANTONE_DATASET = { id: "pantone-reference-library", version: "2026-07-12.1", displayValues: "srgb-screen-approximations" };

const normalizeCode = (s) => s.toLowerCase().replace(/pantone/g, "").replace(/[\s\-_]/g, "").replace(/(tcx|tpg|tpx|c|u)$/, "");
const INDEX = PANTONE_COLORS.map((c) => ({
  color: c,
  text: `${c.name} ${c.code} ${c.family} ${c.aliases.join(" ")}`.toLowerCase(),
  normalizedCode: normalizeCode(c.code),
}));

export function searchPantone(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [...PANTONE_COLORS];
  const nq = normalizeCode(q);
  return INDEX.filter(({ text, normalizedCode }) => text.includes(q) || (nq.length > 0 && normalizedCode.includes(nq))).map((e) => e.color);
}

export function findPantoneByCode(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = PANTONE_COLORS.find((c) => c.code.toLowerCase() === q || c.name.toLowerCase() === q);
  if (exact) return exact;
  const nq = normalizeCode(q);
  return nq ? (PANTONE_COLORS.find((c) => normalizeCode(c.code) === nq) ?? null) : null;
}

function parseCodeSpace(input) {
  const t = input.trim().toUpperCase().replace(/^PANTONE\s+/, "").replace(/\s+(TCX|TPG|TPX|C|U)$/, "").trim();
  const textile = t.match(/^(\d{2})[-\s]?(\d{4})$/);
  if (textile) return { space: "textile", value: 1e4 * Number(textile[1]) + Number(textile[2]) };
  const solid = t.match(/^(\d{3,4})$/);
  return solid ? { space: "solid", value: Number(solid[1]) } : null;
}
const NEAREST_CODE_DISTANCE = { solid: 50, textile: 200 };

export function resolvePantoneQuery(input) {
  const q = input.trim();
  if (!q) return null;
  const exact = findPantoneByCode(q);
  if (exact) return { match: "exact", color: exact };
  const parsed = parseCodeSpace(q);
  if (parsed) {
    let best = null;
    for (const c of PANTONE_COLORS) {
      const p = parseCodeSpace(c.code);
      if (!p || p.space !== parsed.space) continue;
      const d = Math.abs(p.value - parsed.value);
      if (!best || d < best.distance) best = { color: c, distance: d };
    }
    return best && best.distance <= NEAREST_CODE_DISTANCE[parsed.space] ? { match: "nearest", color: best.color, by: "code" } : null;
  }
  const hex = q.startsWith("#") || /^[0-9a-f]{6}$/i.test(q) ? normalizeHex(q) : null;
  if (hex) {
    const n = nearestByDeltaE(hex, PANTONE_COLORS);
    if (n) return { match: "nearest", color: n.entry, by: "color" };
  }
  if (!/[a-z]/i.test(q)) return null;
  const first = searchPantone(q)[0];
  return first ? { match: "nearest", color: first, by: "name" } : null;
}

// One representative per family (up to 12) for the "Popular" strip.
export function popularPantone(limit = 12) {
  const seen = new Set(), out = [];
  for (const c of PANTONE_COLORS) {
    if (seen.has(c.family)) continue;
    seen.add(c.family);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- stocked colourways ------------------------------------------------------------

export function stockedPicksForProduct(product) {
  return (product?.colors ?? []).map((c) => ({
    label: c.label,
    color: { id: c.id, name: c.label, hex: normalizeHex(c.swatchHex) ?? "#ffffff" },
  }));
}

export function defaultStockedSelection(product) {
  const picks = stockedPicksForProduct(product);
  const white = picks.find((p) => /pfd|white/i.test(p.color.id) || /white|pfd/i.test(p.label));
  const pick = white ?? picks[0];
  return pick ? { kind: "stocked", color: pick.color } : { kind: "custom", hex: "#f4f4f5" };
}

// A near-white / near-black hex maps onto a real stocked photo instead of a recolor.
export function stockedKindForHex(hex) {
  const { r, g, b } = hexToRgbLocal(hex);
  if (Math.max(r, g, b) - Math.min(r, g, b) > 16) return null;
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return l >= 0.9 ? "white" : l <= 0.1 ? "black" : null;
}
function hexToRgbLocal(hex) {
  const n = parseInt((normalizeHex(hex) ?? "#000000").slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lin(v) { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

// ---- selection helpers --------------------------------------------------------------

export const selectionHex = (sel) => (sel.kind === "custom" ? sel.hex : sel.color.hex);
export const selectionName = (sel) => (sel.kind === "custom" ? "Custom mix" : sel.color.name);

export function selectionSubtitle(sel) {
  if (sel.kind === "stocked") return `Stocked ${sel.color.id}`;
  if (sel.kind === "pantone") return sel.color.code;
  return `Custom ${sel.hex.toUpperCase()}`;
}

export function selectionNotesLabel(sel) {
  if (sel.kind === "stocked") return `Stocked ${sel.color.name} (${sel.color.hex.toUpperCase()})`;
  if (sel.kind === "pantone") return `Pantone ${sel.color.code} · ${sel.color.name} (${sel.color.hex.toUpperCase()})`;
  const n = nearestByDeltaE(sel.hex, PANTONE_COLORS);
  return `Custom ${sel.hex.toUpperCase()}${n ? `, nearest Pantone ${n.entry.code} ${n.entry.name}` : ""}`;
}

export function serializeSelection(sel) {
  if (sel.kind === "stocked") return { schemaVersion: 2, kind: "stocked", hex: sel.color.hex, canonicalId: `supplier:${sel.color.id}`, colorwayId: sel.color.id, name: sel.color.name };
  if (sel.kind === "pantone") return { schemaVersion: 2, kind: "pantone", hex: sel.color.hex, canonicalId: sel.color.id, name: sel.color.name, code: sel.color.code, datasetVersion: PANTONE_DATASET.version };
  return { schemaVersion: 2, kind: "custom", hex: sel.hex, canonicalId: `custom-hex:${sel.hex.toLowerCase()}`, name: `Custom HEX ${sel.hex.toUpperCase()}` };
}

export function deserializeSelection(raw, product) {
  if (!raw || typeof raw !== "object") return null;
  const hex = typeof raw.hex === "string" ? normalizeHex(raw.hex) : null;
  if (!hex) return null;
  const picks = stockedPicksForProduct(product);
  if (raw.kind === "stocked") {
    const p = picks.find(({ color }) => color.id === raw.colorwayId || color.hex.toLowerCase() === hex);
    if (p) return { kind: "stocked", color: p.color };
  }
  if (raw.kind === "pantone") {
    if (typeof raw.canonicalId === "string") {
      const c = PANTONE_COLORS.find((x) => x.id === raw.canonicalId);
      if (c && c.hex.toLowerCase() === hex) return { kind: "pantone", color: c };
    }
    const c = PANTONE_COLORS.find((x) => x.code === raw.code && x.hex.toLowerCase() === hex) ?? PANTONE_COLORS.find((x) => x.hex.toLowerCase() === hex);
    if (c) return { kind: "pantone", color: c };
  }
  const stocked = picks.find(({ color }) => color.hex.toLowerCase() === hex);
  if (stocked) return { kind: "stocked", color: stocked.color };
  return { kind: "custom", hex };
}

// Resolve a colour hint (colourway id, Pantone code/name, or hex) into a selection for a product.
export function resolveColorHint(hint, product) {
  const h = (hint ?? "").trim();
  if (!h) return null;
  const picks = stockedPicksForProduct(product);
  const low = h.toLowerCase();
  const stocked = picks.find(({ color, label }) => color.id.toLowerCase() === low || label.toLowerCase() === low);
  if (stocked) return { kind: "stocked", color: stocked.color };
  const q = resolvePantoneQuery(h);
  if (q?.match === "exact") return { kind: "pantone", color: q.color };
  const hex = h.startsWith("#") || /^[0-9a-f]{6}$/i.test(h) ? normalizeHex(h) : null;
  if (hex) {
    const kind = stockedKindForHex(hex);
    if (kind) {
      const pick = picks.find(({ color }) => stockedKindForHex(color.hex) === kind);
      if (pick) return { kind: "stocked", color: pick.color };
    }
    const exact = PANTONE_COLORS.find((c) => c.hex === hex);
    return exact ? { kind: "pantone", color: exact } : { kind: "custom", hex };
  }
  return q ? { kind: "pantone", color: q.color } : null;
}
