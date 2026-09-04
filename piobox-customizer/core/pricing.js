// Live pricing: garment + decoration, priced from the design on the stage.
//
// All money is in MINOR units (ZAR cents) to avoid float drift.
// R60.00 = 6000; R21.40 = 2140; R16.28 = 1628.
//
// In.It Branding 2026 rates. Source of truth: docs/init-branding-prices-2026.md
// (copied from catalog/branding/init-branding-prices-2026.md). Copy those rates
// EXACTLY — do not invent missing cells, blank sell prices, or SKUs.
// Supplier MOQs are NOTES only, never blockers. Store MOQ is 1.

export const SETUP_HEAVY_HINT = "Setup is heavy at this qty — around 25 pieces the unit price starts making sense.";
export const SEPARATIONS_NOTE = "Colour separations quoted separately.";
export const STITCH_NOTE = "Stitch count confirmed on proof; extra 1K stitches are R6 each (sheet).";
export const INNER_NECK_NOTE = "Supplier inner-neck MOQ is 25; we still take qty 1.";
export const OVERSIZED_QUOTE = "Oversized DTG (over A3 / 40×50 cm) is a quote.";

// Print-size bands from printed width in inches (stage width = 22in).
// A5 148mm = 5.83in; A4 210mm = 8.27in; A3 297mm = 11.69in. Larger = oversized (quote for DTG/DTF).
// Decoration rates: In.It Apparel "BRANDING PRICE GUIDE 2026" (ZAR, ex VAT, ex apparel and
// delivery). DTG/DTF ladders are published in full. Screen and embroidery publish only the
// 25–49 band; both are held flat above it rather than guessed. Verified 2026-09-03.
export const DEFAULT_PRICING = {
  currency: "ZAR",
  locale: "en-ZA",
  minimumQty: 1,
  // House margin, applied to EVERYTHING we buy in: blanks, print rates and setup fees.
  //   mode "margin" -> sell = cost / (1 - rate)   R100 cost @ 0.40 = R166.67  (40% of the sell price)
  //   mode "markup" -> sell = cost * (1 + rate)   R100 cost @ 0.40 = R140.00  (40% on top of cost)
  // These are NOT the same number. Set deliberately.
  // Alan, 2026-09-03: 40% ON TOP OF COST (cost x 1.4).
  margin: { rate: 0.40, mode: "markup" },

  // 50c, matching the Shopify Decoration ladder. Every In.It rate (R34, R36.50, R51.50 …)
  // lands exactly on a rung, so the quoted price and the cart agree to the cent.
  roundUnitTo: 50,
  // Include the blank in the quote. The cart ALWAYS charges the Shopify garment variant, so
  // turning this off makes the quoted price lower than what the customer actually pays.
  // Only set false if the cart strategy stops adding garment lines too.
  blankSellPrices: true,
  sizeBands: [
    { id: "a5", maxWidthIn: 5.83, label: "A5" },
    { id: "a4", maxWidthIn: 8.27, label: "A4" },
    { id: "a3", maxWidthIn: 11.69, label: "A3" },
    { id: "oversized", maxWidthIn: 99, label: "Oversized" },
  ],
  methods: {
    dtg: {
      label: "DTG",
      setupPerScreen: 0,
      nextBreaks: [6, 16, 26, 51, 101],
      // Qty band × A5/A4/A3. Unlimited colours. No setup.
      white: [
        { minQty: 1, a5: 6000, a4: 7900, a3: 8600 },
        { minQty: 6, a5: 5300, a4: 6800, a3: 7800 },
        { minQty: 16, a5: 4300, a4: 5800, a3: 6600 },
        { minQty: 26, a5: 4000, a4: 5400, a3: 6100 },
        { minQty: 51, a5: 3700, a4: 4900, a3: 5800 },
        { minQty: 101, a5: 3500, a4: 4600, a3: 5500 },
      ],
      colour: [
        { minQty: 1, a5: 8600, a4: 13900, a3: 18500 },
        { minQty: 6, a5: 7300, a4: 12400, a3: 17000 },
        { minQty: 16, a5: 5800, a4: 11000, a3: 14900 },
        { minQty: 26, a5: 5400, a4: 10200, a3: 13700 },
        { minQty: 51, a5: 4900, a4: 9500, a3: 11800 },
        { minQty: 101, a5: 4600, a4: 9200, a3: 11000 },
      ],
    },
    dtf: {
      label: "DTF",
      setupPerScreen: 0,
      nextBreaks: [6, 16, 26, 51, 101],
      innerNeckPerPrint: 1500, // R15. Supplier MOQ 25 is a note, not a blocker.
      // All colour garments, print + application. No setup except inner-neck sheet rate.
      bands: [
        { minQty: 1, a5: 4500, a4: 7000, a3: 11800 },
        { minQty: 6, a5: 3900, a4: 6300, a3: 10800 },
        { minQty: 16, a5: 3600, a4: 6000, a3: 9800 },
        { minQty: 26, a5: 3300, a4: 5700, a3: 9300 },
        { minQty: 51, a5: 3100, a4: 5400, a3: 8800 },
        { minQty: 101, a5: 2900, a4: 5100, a3: 8400 },
      ],
    },
    screen: {
      label: "Screen print",
      maxColors: 8,
      setupPerScreen: 35000, // R350 per screen (per colour per placement). Do not waive.
      // In.It's 2026 guide publishes ONE band (25–49) and says "pricing adjusts according to
      // quantity" — i.e. volume is quoted, not listed. So this rate holds at every quantity:
      // it never undercharges. Add higher bands here once In.It sends the full ladder.
      nextBreaks: [],
      bands: [
        { minQty: 25, perColor: [null, 3400, 3650, 3900, 4400, 4900, 5150, 5900, 6400] },
      ],
    },
    embroidery: {
      label: "Embroidery",
      setupPerPlacement: 30000, // R300 digitisation per artwork / placement. Do not waive.
      // Same as screen: only the 25–49 band is published (R48 for 0–5K stitches, +R6 per
      // additional 1K). Held flat until In.It supplies volume rates.
      nextBreaks: [],
      bands: [
        { minQty: 25, base: 4800 },
      ],
      additionalPer1kStitches: 600,
    },
  },
  // Catalog did not give a custom-colour garment surcharge. Keep 0; no min-qty blocker.
  customColor: { surchargePerUnit: 0, label: "Custom garment colour" },
};

const roundTo = (v, step) => (step > 0 ? Math.max(step, Math.round(v / step) * step) : v);

/** Supplier cost -> our sell price. Used for blanks, print rates and setup fees alike. */
export function applyMargin(cost, pricing = DEFAULT_PRICING) {
  const m = pricing?.margin;
  if (!m || !(m.rate > 0) || !(cost > 0)) return cost;
  const rate = Math.min(0.95, m.rate);
  return m.mode === "markup" ? Math.round(cost * (1 + rate)) : Math.round(cost / (1 - rate));
}
const bandFor = (bands, qty) => {
  if (!bands?.length) return null;
  const sorted = [...bands].sort((a, b) => a.minQty - b.minQty);
  // Qty below the first published band still uses that band (screen/embroidery 1–24 → 25–49).
  return sorted.reduce((best, b) => (qty >= b.minQty ? b : best), sorted[0]);
};
export const sizeBandFor = (pricing, widthIn) => {
  const bands = pricing.sizeBands ?? [];
  if (!bands.length) return { id: "a5", label: "A5", maxWidthIn: 5.83 };
  return bands.find((b) => widthIn <= b.maxWidthIn) ?? bands[bands.length - 1];
};

export function formatMoney(minor, pricing) {
  try {
    return new Intl.NumberFormat(pricing.locale ?? "en-ZA", { style: "currency", currency: pricing.currency ?? "ZAR" }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)}`;
  }
}

// How many ink colours a layer needs. Text is 1 (+1 for an outline); artwork uses the
// preflight colour count when we have it, otherwise a conservative assumption.
export function inkColorsForLayer(layer, analysis, assumed = 4) {
  if (layer.text) return layer.text.outline ? 2 : 1;
  const stats = analysis?.stats;
  if (!stats) return assumed;
  if (stats.continuousTone) return Infinity; // full colour: screen printing not viable
  return Math.max(1, stats.colorCount || assumed);
}

/** White garment for DTG: stocked PFD / pfd-white / white, or hex near #f4f4f5 / #ffffff.
 *  Jet black, Pantone, and other custom shades are colour garments. */
export function hexLooksWhite(hex) {
  const s = String(hex ?? "").trim().replace(/^#/, "").toLowerCase();
  const h = s.length === 3 ? `${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}` : s;
  if (!/^[0-9a-f]{6}$/.test(h)) return false;
  if (h === "ffffff" || h === "f4f4f5") return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) <= 16 && Math.min(r, g, b) >= 240;
}

export function garmentIsWhiteFromSelection(sel) {
  if (!sel) return false;
  if (sel.kind === "pantone") return false;
  const id = String(sel.color?.id ?? "").toLowerCase();
  const name = String(sel.color?.name ?? sel.name ?? "").toLowerCase();
  if (sel.kind === "stocked") {
    if (/(pfd-white|\bpfd\b|white)/.test(id) || /pfd|\bwhite\b/.test(name)) return true;
    return false;
  }
  const hex = sel.kind === "custom" ? sel.hex : sel.color?.hex;
  return hexLooksWhite(hex);
}

/** Inner neck / back neck / neck — not a "crew neck" garment name. */
export function isInnerNeckPlacement(p) {
  const hay = `${p.id ?? ""} ${p.label ?? ""} ${p.area ?? ""}`.toLowerCase();
  const stripped = hay.replace(/crew[\s_-]*neck/g, " ");
  return /\binner[\s_-]*neck\b/.test(stripped) || /\bback[\s_-]*neck\b/.test(stripped) || /\bneck\b/.test(stripped);
}

function aKey(sizeBand) {
  const id = sizeBand?.id;
  return id === "a5" || id === "a4" || id === "a3" ? id : null;
}

function pushNote(notes, level, text) {
  if (!text || notes.some((n) => n.text === text)) return;
  notes.push({ level, text });
}

/**
 * Price a design.
 *
 * unitPrice = (setupTotal + n * printTotal + n * blank) / n
 * which is subtotal/qty when setup lines are one-off qty 1.
 *
 * @param {object} o
 * @param {number} o.quantity          total pieces across all sizes
 * @param {number} o.garmentUnitPrice  minor units; ignored unless pricing.blankSellPrices
 * @param {Array}  [o.garment]         [{ label, qty, unit }] per-size garment lines
 * @param {string} o.method            screen | dtg | dtf | embroidery
 * @param {Array}  o.placements        [{ id, side, widthIn, colors, label }]
 * @param {boolean} o.customColor      garment is a Pantone/custom shade
 * @param {boolean} o.garmentIsWhite   DTG white vs colour garment table
 * @param {object} o.pricing           merchant pricing config
 */
export function priceDesign({ quantity, garmentUnitPrice = 0, garment = null, method, placements = [], customColor = false, garmentIsWhite = false, pricing = DEFAULT_PRICING, _skipNextBreak = false }) {
  const qty = Math.max(0, Math.trunc(quantity) || 0);
  const lookupQty = Math.max(1, qty);
  const m = pricing.methods[method] ?? pricing.methods.dtg ?? pricing.methods.screen;
  const methodId = pricing.methods[method] ? method : (pricing.methods.dtg ? "dtg" : "screen");
  const lines = [];
  const notes = [];
  const blockers = [];

  // Garment / blank sell: omit unless Catalog/Shopify Ops supplied real ZAR prices.
  const includeBlank = pricing.blankSellPrices === true;
  if (includeBlank) {
    if (garment && garment.length) {
      for (const g of garment) if (g.qty > 0 && g.unit > 0) lines.push({ id: `garment-${g.label}`, kind: "garment", label: `Garment · ${g.label}`, unit: g.unit, qty: g.qty, total: g.unit * g.qty });
    } else if (garmentUnitPrice > 0) {
      lines.push({ id: "garment", kind: "garment", label: "Garment", unit: garmentUnitPrice, qty, total: garmentUnitPrice * qty });
    }
  }

  let setupTotal = 0;
  let decorationUnit = 0;
  const step = pricing.roundUnitTo ?? 0;

  for (const p of placements) {
    const sizeBand = sizeBandFor(pricing, p.widthIn ?? 0);
    const colorsRaw = p.colors;
    const finiteColors = Number.isFinite(colorsRaw);
    const colors = finiteColors ? Math.max(1, colorsRaw) : colorsRaw;
    const label = p.label ?? p.id ?? "Print";

    if (methodId === "dtg" || methodId === "dtf") {
      const innerNeck = methodId === "dtf" && isInnerNeckPlacement(p);
      const sizeKey = aKey(sizeBand);
      if (!innerNeck && !sizeKey) {
        pushNote(notes, "warn", OVERSIZED_QUOTE);
        blockers.push({ id: `oversized-${p.id}`, text: OVERSIZED_QUOTE, quoteInstead: true });
        continue;
      }
      let unit;
      let meta;
      if (innerNeck) {
        unit = roundTo(applyMargin(m.innerNeckPerPrint ?? 1500, pricing), step);
        meta = "Inner neck";
        pushNote(notes, "info", INNER_NECK_NOTE);
      } else {
        const table = methodId === "dtg" ? (garmentIsWhite ? m.white : m.colour) : m.bands;
        const band = bandFor(table, lookupQty);
        unit = roundTo(applyMargin(band?.[sizeKey] ?? 0, pricing), step);
        meta = methodId === "dtg"
          ? `${sizeBand.label} · ${garmentIsWhite ? "white garment" : "colour garment"} · unlimited colours`
          : `${sizeBand.label} · print + application`;
      }
      decorationUnit += unit;
      lines.push({
        id: `print-${p.id}`, kind: "decoration", label: `${m.label} · ${label}`,
        meta, unit, qty, total: unit * qty,
      });
    } else if (methodId === "screen") {
      pushNote(notes, "info", SEPARATIONS_NOTE);
      if (!finiteColors) {
        pushNote(notes, "warn", `“${label}” is full-colour / continuous-tone artwork. Screen printing has no full-colour rate on the sheet — switch to DTG or DTF, or we’ll quote a halftone.`);
        blockers.push({ id: `screen-fullcolour-${p.id}`, text: `“${label}” needs a quote for screen (no full-colour rate). Try DTG or DTF.`, quoteInstead: true });
        continue;
      }
      if (colors > (m.maxColors ?? 8)) {
        pushNote(notes, "warn", `“${label}” has ${colors} colours, over the ${m.maxColors}-screen limit. Simplify the artwork or choose DTG/DTF. No 9th-colour rate on the sheet.`);
        blockers.push({ id: `screen-colors-${p.id}`, text: `“${label}” has ${colors} colours (max ${m.maxColors} on the sheet). Simplify or choose DTG/DTF.`, quoteInstead: true });
        continue;
      }
      const band = bandFor(m.bands, lookupQty);
      const nScreens = Math.min(colors, m.maxColors ?? 8);
      const unit = roundTo(applyMargin(band?.perColor?.[nScreens] ?? 0, pricing), step);
      decorationUnit += unit;
      lines.push({
        id: `print-${p.id}`, kind: "decoration", label: `${m.label} · ${label}`,
        meta: `${nScreens} ${nScreens === 1 ? "colour" : "colours"}`,
        unit, qty, total: unit * qty,
      });
      const setupUnit = roundTo(applyMargin(m.setupPerScreen ?? 0, pricing), step);
      if (setupUnit > 0 && nScreens > 0) {
        setupTotal += setupUnit * nScreens;
        lines.push({ id: `setup-${p.id}`, kind: "setup", label: `Screens · ${label}`, unit: setupUnit, qty: nScreens, total: setupUnit * nScreens, oneOff: true });
      }
    } else if (methodId === "embroidery") {
      pushNote(notes, "info", STITCH_NOTE);
      const band = bandFor(m.bands, lookupQty);
      const unit = roundTo(applyMargin(band?.base ?? 0, pricing), step);
      decorationUnit += unit;
      lines.push({
        id: `print-${p.id}`, kind: "decoration", label: `${m.label} · ${label}`,
        meta: "0–5K stitches",
        unit, qty, total: unit * qty,
      });
      const setup = roundTo(applyMargin(m.setupPerPlacement ?? 0, pricing), step);
      if (setup > 0) {
        setupTotal += setup;
        lines.push({ id: `setup-${p.id}`, kind: "setup", label: `Digitising · ${label}`, unit: setup, qty: 1, total: setup, oneOff: true });
      }
    }
  }

  if ((methodId === "screen" || methodId === "embroidery") && qty > 0 && qty < 25 && placements.length > 0) {
    pushNote(notes, "info", SETUP_HEAVY_HINT);
  }

  // Custom colour surcharge only when Catalog gave a real number (it did not).
  let customColorTotal = 0;
  const cc = pricing.customColor;
  const ccUnit = roundTo(cc?.surchargePerUnit ?? 0, step);
  if (customColor && cc && ccUnit > 0) {
    customColorTotal = ccUnit * qty;
    lines.push({ id: "custom-color", kind: "surcharge", label: cc.label ?? "Custom garment colour", unit: ccUnit, qty, total: customColorTotal });
    if (cc.minQty && qty > 0 && qty < cc.minQty) {
      blockers.push({ id: "custom-color-min", text: `A custom garment colour needs ${cc.minQty}+ pieces. Pick a stocked colour, or request a quote and we’ll spec it with you.`, quoteInstead: true });
    }
  }

  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const unitPrice = qty > 0 ? Math.round(subtotal / qty) : garmentUnitPrice + decorationUnit;

  // No store MOQ blocker. minimumQty 1: qty 1 is allowed on every method.
  if (qty > 0 && qty < (pricing.minimumQty ?? 1)) blockers.push({ id: "min-qty", text: `Minimum order is ${pricing.minimumQty} pieces.` });

  let nextBreak = null;
  if (!_skipNextBreak && placements.length > 0) {
    const thresholds = m.nextBreaks ?? (m.bands ?? m.white ?? []).map((b) => b.minQty);
    for (const nextQty of thresholds) {
      if (!(nextQty > qty)) continue;
      const scale = qty > 0 ? nextQty / qty : 1;
      const at = priceDesign({
        quantity: nextQty,
        garmentUnitPrice: includeBlank ? garmentUnitPrice : 0,
        garment: includeBlank ? (garment?.map((g) => ({ ...g, qty: Math.round(g.qty * scale) })) ?? null) : null,
        method: methodId,
        placements,
        customColor,
        garmentIsWhite,
        pricing,
        _skipNextBreak: true,
      });
      if (at.unitPrice < unitPrice) {
        nextBreak = { qty: nextQty, unitPrice: at.unitPrice, saving: unitPrice - at.unitPrice };
        break;
      }
    }
  }

  const band = methodId === "dtg"
    ? bandFor(garmentIsWhite ? m.white : m.colour, lookupQty)
    : bandFor(m.bands, lookupQty);

  return { lines, subtotal, unitPrice, quantity: qty, setupTotal, decorationUnit, garmentUnitPrice: includeBlank ? garmentUnitPrice : 0, method: methodId, currency: pricing.currency, notes, blockers, nextBreak, band };
}
