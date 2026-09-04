// Print zones and placement presets.
// All coordinates are fractions of the square stage (0..1). Garment-relative zones (u/v) are mapped
// onto the stage through the product photo's frame box so they land on the real garment.

export const STAGE_PAD_FRAC = 12 / 544;
export const STAGE_INCHES = 22; // the full stage width represents ~22 in of garment
export const APPAREL_TOP_CATEGORIES = ["Tees", "Fleece", "Outerwear"];
export const isApparelTopCategory = (c) => APPAREL_TOP_CATEGORIES.includes(c);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- fallback presets (used when a photo has no frame box) ----------------------------
const FRONT_TOP = [
  { id: "center-chest", label: "Center chest", cx: 0.5, cy: 0.4, width: 0.26 },
  { id: "full-front", label: "Full front", cx: 0.5, cy: 0.46, width: 0.38 },
  { id: "left-chest", label: "Left chest", cx: 0.595, cy: 0.335, width: 0.105 },
  { id: "right-chest", label: "Right chest", cx: 0.405, cy: 0.335, width: 0.105 },
];
const FRONT_BOTTOMS = [{ id: "thigh", label: "Thigh", cx: 0.605, cy: 0.42, width: 0.12 }, { id: "hip", label: "Hip", cx: 0.41, cy: 0.36, width: 0.1 }];
const FRONT_HEADWEAR = [{ id: "front-center", label: "Front center", cx: 0.5, cy: 0.43, width: 0.22 }, { id: "front-small", label: "Small front", cx: 0.5, cy: 0.42, width: 0.14 }, { id: "left-panel", label: "Left panel", cx: 0.4, cy: 0.44, width: 0.12 }];
const FRONT_ACCESSORY = [{ id: "center-front", label: "Center front", cx: 0.5, cy: 0.48, width: 0.32 }, { id: "small-front", label: "Small front", cx: 0.5, cy: 0.42, width: 0.18 }, { id: "full-face", label: "Full face", cx: 0.5, cy: 0.5, width: 0.42 }];
const BACK_TOP = [{ id: "full-back", label: "Full back", cx: 0.5, cy: 0.46, width: 0.5 }, { id: "center-back", label: "Center back", cx: 0.5, cy: 0.5, width: 0.36 }, { id: "upper-back", label: "Upper back", cx: 0.5, cy: 0.33, width: 0.3 }];
const BACK_BOTTOMS = [{ id: "back-hip", label: "Back hip", cx: 0.5, cy: 0.4, width: 0.14 }, { id: "seat", label: "Seat", cx: 0.5, cy: 0.5, width: 0.18 }];
const frontPresets = (cat) => (cat === "Headwear" ? FRONT_HEADWEAR : cat === "Accessories" ? FRONT_ACCESSORY : cat === "Bottoms" ? FRONT_BOTTOMS : FRONT_TOP);
export function placementPresetsForSide(category, side) {
  if (side === "front") return frontPresets(category);
  if (isApparelTopCategory(category)) return BACK_TOP;
  if (category === "Bottoms") return BACK_BOTTOMS;
  return frontPresets(category);
}
export function printZoneForSide(category, side) {
  if (side === "back" && isApparelTopCategory(category)) return { x: 0.24, y: 0.18, w: 0.52, h: 0.54 };
  if (category === "Headwear") return { x: 0.34, y: 0.3, w: 0.32, h: 0.22 };
  if (category === "Accessories") return { x: 0.28, y: 0.32, w: 0.44, h: 0.36 };
  if (category === "Bottoms") return { x: 0.34, y: 0.28, w: 0.38, h: 0.34 };
  return { x: 0.3, y: 0.26, w: 0.4, h: 0.38 };
}

export function constrainPlacementToZone(p, rect, aspect) {
  const ar = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const rad = (p.rotation * Math.PI) / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
  const maxW = Math.max(0.008, Math.min(0.92, rect.w / (c + ar * s || 1), rect.h / (s + ar * c || 1)));
  const width = clamp(p.width, Math.min(0.04, maxW), maxW);
  const hw = (width * c + width * ar * s) / 2, hh = (width * s + width * ar * c) / 2;
  const x0 = rect.x + hw, x1 = rect.x + rect.w - hw, y0 = rect.y + hh, y1 = rect.y + rect.h - hh;
  return { ...p, width, cx: x0 <= x1 ? clamp(p.cx, x0, x1) : rect.x + rect.w / 2, cy: y0 <= y1 ? clamp(p.cy, y0, y1) : rect.y + rect.h / 2 };
}

export function estimateArtworkQuality(naturalW, width, isVector) {
  if (isVector) return { quality: "vector", dpi: null };
  const dpi = Math.round(naturalW / Math.max(0.5, STAGE_INCHES * width));
  return dpi >= 150 ? { quality: "great", dpi } : dpi >= 90 ? { quality: "good", dpi } : { quality: "low", dpi };
}

// ---- garment-relative zones (u/v fractions of the garment's bounding box) -------------------
const panel = (label, x, y, w, h, spots) => ({ label, x, y, w, h, spots });
const ACCESSORY_PANELS = {
  bottle: panel("Bottle panel", 0.17, 0.28, 0.66, 0.4, [{ id: "bottle-center", label: "Center mark", x: 0.5, y: 0.43, w: 0.54 }, { id: "bottle-small", label: "Small mark", x: 0.5, y: 0.39, w: 0.38 }]),
  tote: panel("Tote panel", 0.15, 0.45, 0.7, 0.39, [{ id: "tote-center", label: "Center front", x: 0.5, y: 0.58, w: 0.5 }, { id: "tote-large", label: "Large front", x: 0.5, y: 0.62, w: 0.64 }]),
  backpack: panel("Front panel", 0.2, 0.28, 0.6, 0.48, [{ id: "backpack-center", label: "Center front", x: 0.5, y: 0.48, w: 0.42 }, { id: "backpack-small", label: "Small front", x: 0.5, y: 0.42, w: 0.28 }]),
  apron: panel("Front panel", 0.22, 0.18, 0.56, 0.58, [{ id: "apron-chest", label: "Chest mark", x: 0.5, y: 0.34, w: 0.36 }, { id: "apron-center", label: "Center front", x: 0.5, y: 0.48, w: 0.44 }]),
  fanny: panel("Front panel", 0.22, 0.28, 0.56, 0.38, [{ id: "fanny-center", label: "Center front", x: 0.5, y: 0.46, w: 0.4 }, { id: "fanny-small", label: "Small front", x: 0.5, y: 0.42, w: 0.26 }]),
  blanket: panel("Blanket face", 0.09, 0.09, 0.82, 0.82, [{ id: "blanket-center", label: "Center", x: 0.5, y: 0.5, w: 0.46 }, { id: "blanket-corner", label: "Lower corner", x: 0.7, y: 0.72, w: 0.2 }]),
  keycap: panel("Keycap face", 0.2, 0.2, 0.6, 0.48, [{ id: "keycap-center", label: "Center", x: 0.5, y: 0.43, w: 0.38 }, { id: "keycap-small", label: "Small mark", x: 0.5, y: 0.41, w: 0.25 }]),
  cap: panel("Crown", 0.22, 0.22, 0.56, 0.3, [{ id: "front-center", label: "Front center", x: 0.5, y: 0.37, w: 0.42 }, { id: "front-small", label: "Small front", x: 0.5, y: 0.35, w: 0.28 }]),
  beanie: panel("Cuff", 0.23, 0.48, 0.54, 0.22, [{ id: "cuff-center", label: "Cuff center", x: 0.5, y: 0.59, w: 0.34 }, { id: "cuff-small", label: "Small cuff", x: 0.5, y: 0.58, w: 0.24 }]),
  generic: panel("Front panel", 0.14, 0.22, 0.72, 0.58, [{ id: "center-front", label: "Center front", x: 0.5, y: 0.5, w: 0.48 }, { id: "small-front", label: "Small front", x: 0.5, y: 0.43, w: 0.3 }]),
  tumbler: panel("Body wrap", 0.22, 0.14, 0.56, 0.7, [{ id: "tumbler-center", label: "Center wrap", x: 0.5, y: 0.45, w: 0.5 }, { id: "tumbler-small", label: "Small mark", x: 0.5, y: 0.38, w: 0.34 }]),
  sock: panel("Leg", 0.16, 0.06, 0.33, 0.35, [{ id: "sock-leg", label: "Leg mark", x: 0.325, y: 0.26, w: 0.24 }, { id: "sock-cuff", label: "Cuff mark", x: 0.325, y: 0.11, w: 0.2 }]),
  lanyard: panel("Strap face", 0.41, 0.63, 0.18, 0.14, [{ id: "lanyard-center", label: "Center strap", x: 0.5, y: 0.7, w: 0.14 }, { id: "lanyard-small", label: "Small mark", x: 0.5, y: 0.67, w: 0.1 }]),
  badge: panel("Card face", 0.12, 0.2, 0.76, 0.66, [{ id: "badge-center", label: "Card center", x: 0.5, y: 0.52, w: 0.56 }, { id: "badge-top", label: "Top strip", x: 0.5, y: 0.31, w: 0.44 }]),
  pin: panel("Face", 0.23, 0.19, 0.48, 0.4, [{ id: "pin-center", label: "Center", x: 0.47, y: 0.39, w: 0.32 }, { id: "pin-small", label: "Small mark", x: 0.47, y: 0.36, w: 0.22 }]),
  bandana: panel("Front panel", 0.18, 0.28, 0.64, 0.42, [{ id: "bandana-center", label: "Center", x: 0.5, y: 0.52, w: 0.42 }, { id: "bandana-small", label: "Small mark", x: 0.5, y: 0.44, w: 0.28 }]),
  vinyl: panel("Label", 0.32, 0.32, 0.36, 0.36, [{ id: "vinyl-label", label: "Label center", x: 0.5, y: 0.5, w: 0.28 }, { id: "vinyl-small", label: "Small mark", x: 0.5, y: 0.5, w: 0.18 }]),
  mousepad: panel("Pad face", 0.06, 0.08, 0.88, 0.84, [{ id: "mousepad-center", label: "Center", x: 0.5, y: 0.5, w: 0.62 }, { id: "mousepad-small", label: "Small mark", x: 0.5, y: 0.45, w: 0.36 }]),
  luggage: panel("Tag face", 0.19, 0.33, 0.54, 0.46, [{ id: "tag-center", label: "Center", x: 0.5, y: 0.52, w: 0.44 }, { id: "tag-small", label: "Small mark", x: 0.5, y: 0.46, w: 0.3 }]),
};
function accessoryPanelFor(category, name) {
  const n = name.toLowerCase();
  if (category === "Headwear") return /beanie|cuff|knit/.test(n) ? ACCESSORY_PANELS.beanie : ACCESSORY_PANELS.cap;
  if (category !== "Accessories") return null;
  if (/tumbler/.test(n)) return ACCESSORY_PANELS.tumbler;
  if (/water bottle|bottle|drinkware/.test(n)) return ACCESSORY_PANELS.bottle;
  if (/backpack/.test(n)) return ACCESSORY_PANELS.backpack;
  if (/fanny|waist bag|belt bag/.test(n)) return ACCESSORY_PANELS.fanny;
  if (/apron/.test(n)) return ACCESSORY_PANELS.apron;
  if (/tote|\bbag\b/.test(n)) return ACCESSORY_PANELS.tote;
  if (/blanket|throw/.test(n)) return ACCESSORY_PANELS.blanket;
  if (/keycap|key cap/.test(n)) return ACCESSORY_PANELS.keycap;
  if (/sock/.test(n)) return ACCESSORY_PANELS.sock;
  if (/lanyard/.test(n)) return ACCESSORY_PANELS.lanyard;
  if (/badge/.test(n)) return ACCESSORY_PANELS.badge;
  if (/pin/.test(n)) return ACCESSORY_PANELS.pin;
  if (/bandana/.test(n)) return ACCESSORY_PANELS.bandana;
  if (/vinyl|record/.test(n)) return ACCESSORY_PANELS.vinyl;
  if (/mousepad|mouse pad/.test(n)) return ACCESSORY_PANELS.mousepad;
  if (/luggage/.test(n)) return ACCESSORY_PANELS.luggage;
  return ACCESSORY_PANELS.generic;
}

const mirrorSlot = (z) => ({ ...z, hand: "viewer-right", u: 1 - z.u - z.uw, spots: z.spots.map((s) => ({ ...s, u: 1 - s.u })) });
const BODY_FRONT_SHORT = { slot: "body", kind: "body", u: 0.235, v: 0.15, uw: 0.53, vh: 0.59, spots: [
  { id: "left-chest", label: "Left chest", u: 0.618, v: 0.304, uw: 0.128 }, { id: "center-chest", label: "Center chest", u: 0.5, v: 0.381, uw: 0.317 },
  { id: "right-chest", label: "Right chest", u: 0.382, v: 0.304, uw: 0.128 }, { id: "full-front", label: "Full front", u: 0.5, v: 0.452, uw: 0.463 } ] };
const BODY_BACK_SHORT = { slot: "body", kind: "body", u: 0.235, v: 0.11, uw: 0.53, vh: 0.65, spots: [
  { id: "full-back", label: "Full back", u: 0.5, v: 0.44, uw: 0.5 }, { id: "center-back", label: "Center back", u: 0.5, v: 0.46, uw: 0.42 },
  { id: "upper-back", label: "Upper back", u: 0.5, v: 0.27, uw: 0.34 }, { id: "back-neck", label: "Back neck", u: 0.5, v: 0.15, uw: 0.12 } ] };
const SLEEVE_LONG = { slot: "sleeve", kind: "sleeve", hand: "viewer-left", u: 0.105, v: 0.665, uw: 0.06, vh: 0.09, spots: [{ id: "sleeve", label: "Sleeve", u: 0.135, v: 0.71, uw: 0.05 }] };
const BODY_FRONT_LONG = { slot: "body", kind: "body", u: 0.255, v: 0.2, uw: 0.49, vh: 0.475, spots: [
  { id: "left-chest", label: "Left chest", u: 0.625, v: 0.3, uw: 0.13 }, { id: "center-chest", label: "Center chest", u: 0.5, v: 0.35, uw: 0.3 },
  { id: "right-chest", label: "Right chest", u: 0.375, v: 0.3, uw: 0.13 }, { id: "full-front", label: "Full front", u: 0.5, v: 0.44, uw: 0.44 } ] };
const BODY_BACK_LONG = { slot: "body", kind: "body", u: 0.25, v: 0.2, uw: 0.5, vh: 0.58, spots: [
  { id: "full-back", label: "Full back", u: 0.5, v: 0.48, uw: 0.46 }, { id: "center-back", label: "Center back", u: 0.5, v: 0.5, uw: 0.36 },
  { id: "upper-back", label: "Upper back", u: 0.5, v: 0.31, uw: 0.32 }, { id: "back-neck", label: "Back neck", u: 0.5, v: 0.25, uw: 0.11 } ] };
const BODY_BACK_CROP = { ...BODY_BACK_LONG, vh: 0.52, spots: BODY_BACK_LONG.spots.map((s) => (s.id === "full-back" ? { ...s, v: 0.45, uw: 0.44 } : s.id === "center-back" ? { ...s, v: 0.46 } : s)) };
const LEG_LONG = { slot: "leg", kind: "leg", hand: "viewer-left", u: 0.16, v: 0.18, uw: 0.26, vh: 0.34, spots: [{ id: "thigh", label: "Thigh", u: 0.28, v: 0.4, uw: 0.15 }, { id: "hip", label: "Hip", u: 0.26, v: 0.26, uw: 0.12 }] };
const LEG_SHORT = { slot: "leg", kind: "leg", hand: "viewer-left", u: 0.13, v: 0.13, uw: 0.3, vh: 0.68, spots: [{ id: "thigh", label: "Thigh", u: 0.27, v: 0.56, uw: 0.17 }, { id: "hip", label: "Hip", u: 0.24, v: 0.22, uw: 0.12 }] };
const topLayout = (sleeve, front, back) => ({ front: [front, sleeve, mirrorSlot(sleeve)], back: [back, sleeve, mirrorSlot(sleeve)] });
const LAYOUTS = {
  "top-short-sleeve": topLayout({ slot: "sleeve", kind: "sleeve", hand: "viewer-left", u: 0.095, v: 0.27, uw: 0.085, vh: 0.07, spots: [{ id: "sleeve", label: "Sleeve", u: 0.1375, v: 0.305, uw: 0.06 }] }, BODY_FRONT_SHORT, BODY_BACK_SHORT),
  "top-drop-sleeve": topLayout({ slot: "sleeve", kind: "sleeve", hand: "viewer-left", u: 0.1, v: 0.31, uw: 0.07, vh: 0.08, spots: [{ id: "sleeve", label: "Sleeve", u: 0.135, v: 0.35, uw: 0.05 }] }, BODY_FRONT_SHORT, BODY_BACK_SHORT),
  "top-long-sleeve": topLayout(SLEEVE_LONG, BODY_FRONT_LONG, BODY_BACK_LONG),
  "top-long-sleeve-crop": topLayout(SLEEVE_LONG, BODY_FRONT_LONG, BODY_BACK_CROP),
  "bottoms-long": { front: [LEG_LONG, mirrorSlot(LEG_LONG)], back: [LEG_LONG, mirrorSlot(LEG_LONG)] },
  "bottoms-short": { front: [LEG_SHORT, mirrorSlot(LEG_SHORT)], back: [LEG_SHORT, mirrorSlot(LEG_SHORT)] },
};
function layoutKeyFor(category, name, fit) {
  const n = name.toLowerCase();
  if (category === "Bottoms") return /short/.test(n) ? "bottoms-short" : "bottoms-long";
  if (category === "Fleece" || category === "Outerwear") return /crop/.test(n) ? "top-long-sleeve-crop" : "top-long-sleeve";
  if (category === "Tees") return /long[ -]?sleeve/.test(n) ? "top-long-sleeve" : /drop[ -]?shoulder/.test(n) || fit === "Oversized" ? "top-drop-sleeve" : "top-short-sleeve";
  return null;
}
// Map the photo's garment box (fractions of the image) onto the stage.
function stageBoxFromFrame(frame) {
  if (!frame) return null;
  const inner = 1 - 2 * STAGE_PAD_FRAC, ar = frame.ar > 0 ? frame.ar : 1;
  const iw = ar >= 1 ? inner : inner * ar, ih = ar >= 1 ? inner / ar : inner;
  const ox = STAGE_PAD_FRAC + (inner - iw) / 2, oy = STAGE_PAD_FRAC + (inner - ih) / 2;
  return { x: ox + (frame.cx - frame.w / 2) * iw, y: oy + (frame.cy - frame.h / 2) * ih, w: frame.w * iw, h: frame.h * ih };
}
function fallbackLayout(category, side) {
  return {
    areas: [{ id: side, label: side === "back" ? "Back" : "Front", kind: "body", rect: printZoneForSide(category, side) }],
    spots: placementPresetsForSide(category, side).map((s) => ({ ...s, areaId: side })),
  };
}
export function garmentPrintLayout({ category, name, fit, side, frame, mirrored = false }) {
  const key = layoutKeyFor(category, name, fit);
  const box = stageBoxFromFrame(frame);
  if (!box) return fallbackLayout(category, side);
  if (!key) {
    const p = accessoryPanelFor(category, name);
    if (!p) return fallbackLayout(category, side);
    const rect = { x: box.x + p.x * box.w, y: box.y + p.y * box.h, w: p.w * box.w, h: p.h * box.h };
    return {
      areas: [{ id: side, label: `${side === "back" ? "Back" : "Front"} ${p.label.toLowerCase()}`, kind: "body", rect }],
      spots: p.spots.map((s) => ({ id: side === "back" ? `${s.id}-back` : s.id, label: side === "back" ? `${s.label} · back` : s.label, areaId: side, cx: box.x + s.x * box.w, cy: box.y + s.y * box.h, width: s.w * box.w })),
    };
  }
  const areas = [], spots = [];
  for (const zone of LAYOUTS[key][side]) {
    const u = mirrored ? 1 - zone.u - zone.uw : zone.u;
    let area;
    if (zone.slot === "body") area = { id: side, label: side === "back" ? "Back" : "Front" };
    else {
      const hand = mirrored ? (zone.hand === "viewer-left" ? "viewer-right" : "viewer-left") : zone.hand ?? "viewer-left";
      const isLeft = side === "back" ? hand === "viewer-left" : hand === "viewer-right";
      const kind = zone.slot === "sleeve" ? "sleeve" : "leg";
      area = { id: `${kind}-${isLeft ? "left" : "right"}`, label: `${isLeft ? "Left" : "Right"} ${kind}` };
    }
    areas.push({ id: area.id, label: area.label, kind: zone.kind, rect: { x: box.x + u * box.w, y: box.y + zone.v * box.h, w: zone.uw * box.w, h: zone.vh * box.h } });
    for (const s of zone.spots) {
      const su = mirrored ? 1 - s.u : s.u;
      spots.push({ id: zone.slot === "body" ? s.id : `${area.id}-${s.id}`, label: zone.slot === "body" ? s.label : area.label, areaId: area.id, cx: box.x + su * box.w, cy: box.y + s.v * box.h, width: s.uw * box.w });
    }
  }
  return { areas, spots };
}

const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const dist2 = (r, x, y) => { const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h)); return dx * dx + dy * dy; };
export function resolvePlacementArea(areas, p) {
  if (!areas.length) return null;
  const current = areas.find((a) => a.id === p.area) ?? null;
  if (current && inside(current.rect, p.cx, p.cy)) return current;
  const other = areas.find((a) => a.id !== current?.id && inside(a.rect, p.cx, p.cy));
  if (other) return other;
  if (current) return current;
  const pool = areas.some((a) => a.kind === "body") ? areas.filter((a) => a.kind === "body") : areas;
  return pool.reduce((best, a) => (dist2(a.rect, p.cx, p.cy) < dist2(best.rect, p.cx, p.cy) ? a : best));
}
export function constrainPlacementToAreas(p, areas, aspect) {
  const area = resolvePlacementArea(areas, p);
  if (!area) return p;
  const c = constrainPlacementToZone(p, area.rect, aspect);
  return c.area === area.id ? c : { ...c, area: area.id };
}
export function defaultPlacementForLayout(layout) {
  const spot = layout.spots[0], area = layout.areas[0];
  if (!spot) {
    const r = area?.rect;
    return { cx: r ? r.x + r.w / 2 : 0.5, cy: r ? r.y + r.h / 2 : 0.45, width: r ? 0.7 * Math.min(r.w, r.h) : 0.26, rotation: 0, flipX: false, area: area?.id };
  }
  return { cx: spot.cx, cy: spot.cy, width: spot.width, rotation: 0, flipX: false, area: spot.areaId };
}
export function placementAreaLabel(layout, p) { return resolvePlacementArea(layout.areas, p)?.label ?? null; }
export function remapPlacementBetweenLayouts(p, from, to, aspect) {
  const src = resolvePlacementArea(from.areas, p);
  const dst = (src ? to.areas.find((a) => a.id === src.id) : null) ?? (src ? to.areas.find((a) => a.kind === src.kind) : null) ?? to.areas.find((a) => a.kind === "body") ?? to.areas[0] ?? null;
  if (!src || !dst || src.rect.w <= 0 || src.rect.h <= 0) return constrainPlacementToAreas(defaultPlacementForLayout(to), to.areas, aspect);
  const fx = clamp((p.cx - src.rect.x) / src.rect.w, 0, 1), fy = clamp((p.cy - src.rect.y) / src.rect.h, 0, 1), fw = p.width / src.rect.w;
  return constrainPlacementToAreas({ ...p, cx: dst.rect.x + fx * dst.rect.w, cy: dst.rect.y + fy * dst.rect.h, width: fw * dst.rect.w, area: dst.id }, to.areas, aspect);
}
export function sanitizePlacement(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.cx !== "number" || typeof raw.cy !== "number" || typeof raw.width !== "number" || typeof raw.rotation !== "number") return null;
  return { cx: clamp(raw.cx, 0.05, 0.95), cy: clamp(raw.cy, 0.05, 0.95), width: clamp(raw.width, 0.04, 0.92), rotation: clamp(Math.round(raw.rotation), -180, 180), flipX: raw.flipX === true, area: typeof raw.area === "string" ? raw.area : undefined };
}
