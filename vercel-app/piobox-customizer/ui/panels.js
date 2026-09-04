// Declarative panels (rendered with h() and reconciled with morph()).
import { h, svg } from "./dom.js";
import { I } from "./icons.js";
import { PANTONE_FAMILIES, PANTONE_COLORS, searchPantone, popularPantone, findPantoneByCode, resolvePantoneQuery, stockedPicksForProduct, selectionHex, selectionName, selectionSubtitle } from "../core/pantone.js";
import { hexToHsv, hsvToHex, nearestByDeltaE, readableInkOn, relativeLuminance, normalizeHex } from "../core/color.js";
import { INK_COLORS, TEXT_STARTERS } from "../core/text.js";
import { isApparelTopCategory } from "../core/placements.js";
import { FONT_ACCEPT_ATTR } from "../core/fonts.js";
import { DESIGN_RAIL_MAX } from "../core/draft.js";

const CATEGORY_LABELS = { Tees: "Tees", Fleece: "Hoodies", Bottoms: "Bottoms", Headwear: "Hats", Outerwear: "Outerwear", Accessories: "Accessories" };
const SIDE_LABEL = { front: "Front", back: "Back" };
const METHODS = [
  { id: "dtg", label: "DTG", note: "Low qty" },
  { id: "dtf", label: "DTF", note: "Low qty" },
  { id: "screen", label: "Screen print", note: "Setup · best ~25" },
  { id: "embroidery", label: "Embroidery", note: "Setup · best ~25" },
];
export const PRICE_BREAKS = [1, 6, 16, 25, 50, 100, 200, 500];
const cn = (...c) => c.filter(Boolean).join(" ");
const layerCount = (sides) => (sides ? sides.front.filter(isReal).length + sides.back.filter(isReal).length : 0);
const isReal = (l) => !l.text || l.text.content.trim() !== "";
const serializedCount = (s) => ["front", "back"].reduce((n, side) => n + (Array.isArray(s?.[side]) ? s[side].filter((l) => l && (!l.text || (l.text.content ?? "").trim() !== "")).length : 0), 0);

// ---------------------------------------------------------------- designs rail
export function renderDesignsRail(s, a) {
  return h("div", { class: "pc-rail", role: "group", "aria-label": "Your designs" },
    h("span", { class: "pc-overline pc-rail__label" }, "Designs"),
    s.designs.map((d, i) => {
      const active = d.id === s.activeDesignId;
      const product = s.products.find((p) => p.id === (active ? s.productId : d.productId));
      const count = active ? s.layerTotal : d.pending ? serializedCount(d.pending.sides) : layerCount(d.stash);
      return h("div", { key: d.id, class: cn("pc-rail__item", active && "is-active") },
        h("button", { type: "button", class: "pc-rail__btn", "aria-pressed": active, "aria-label": `Edit design ${i + 1}${product ? ` on ${product.name}` : ""}`, onclick: () => a.switchDesign(d.id) },
          h("span", { class: "pc-rail__num" }, i + 1),
          h("span", { class: "pc-rail__text" }, h("span", { class: "pc-rail__name" }, product?.name ?? "New design"), h("span", { class: "pc-rail__meta" }, count === 0 ? "Empty" : count === 1 ? "1 layer" : `${count} layers`))),
        s.designs.length > 1 ? h("button", { type: "button", class: "pc-rail__remove", "aria-label": `Remove design ${i + 1}`, title: "Remove design", onclick: () => a.removeDesign(d.id) }, svg(I.x)) : null);
    }),
    s.designs.length < DESIGN_RAIL_MAX
      ? [h("button", { type: "button", class: "pc-rail__add", title: "Start another design on this blank (keeps this one)", onclick: a.newDesign }, svg(I.plus), "New design"),
         s.layerTotal > 0 ? h("button", { type: "button", class: "pc-rail__add", title: "Duplicate this design to try a variation", onclick: a.duplicateDesign }, svg(I.copy), "Duplicate") : null]
      : h("span", { class: "pc-rail__cap" }, `Up to ${DESIGN_RAIL_MAX} designs`),
    s.notice ? h("div", { class: "pc-notice", role: "status" }, h("span", null, s.notice), h("button", { type: "button", class: "pc-notice__x", "aria-label": "Dismiss", onclick: a.dismissNotice }, svg(I.x))) : null);
}

// ---------------------------------------------------------------- blanks
export function renderBlanks(s, a) {
  const categories = ["Tees", "Fleece", "Bottoms", "Headwear", "Outerwear", "Accessories"].filter((c) => s.products.some((p) => p.category === c));
  const q = s.blanksQuery.trim().toLowerCase();
  const filtered = s.products.filter((p) => (s.blanksCategory === "all" || p.category === s.blanksCategory) && (!q || p.name.toLowerCase().includes(q) || p.styleNumber.toLowerCase().includes(q)));
  const filtering = s.blanksCategory !== "all" || q.length > 0;
  const expanded = filtering || s.blanksExpanded;
  let shown = filtered;
  if (!expanded) { shown = filtered.slice(0, 6); if (s.product && !shown.some((p) => p.id === s.product.id) && filtered.some((p) => p.id === s.product.id)) shown = [s.product, ...shown.slice(0, 5)]; }
  const hidden = filtered.length - shown.length;
  return h("section", { class: "pc-panel pc-panel--blanks", id: "pc-section-blank", "aria-labelledby": "pc-h-blank" },
    h("h2", { class: "pc-overline pc-panel__title", id: "pc-h-blank" }, s.labels.blanks, h("button", { type: "button", class: "pc-panel__hide", onclick: () => a.toggleBlanks(true), title: "Hide the blanks column to give the design more room" }, "Hide")),
    h("div", { class: "pc-panel__scroll", "data-scroller": "blanks" },
      h("div", { class: "pc-blanks__head" },
        h("div", { class: "pc-search" }, svg(I.search, "pc-search__icon"), h("input", { type: "search", value: s.blanksQuery, placeholder: "Search styles or codes", "aria-label": "Search blanks", class: "pc-input pc-input--search", oninput: (e) => a.setBlanksQuery(e.target.value) })),
        categories.length > 1 ? h("div", { class: "pc-chips", role: "tablist", "aria-label": "Filter blanks by category" },
          [{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] ?? c }))].map((c) =>
            h("button", { key: c.id, type: "button", role: "tab", class: cn("pc-chip", s.blanksCategory === c.id && "is-active"), "aria-selected": s.blanksCategory === c.id, onclick: () => a.setBlanksCategory(c.id) }, c.label))) : null,
        h("p", { class: "pc-mono-meta" }, filtering ? `${filtered.length} of ${s.products.length} styles` : `${s.products.length} styles`)),
      h("div", { class: "pc-blanks__grid" },
        shown.length === 0 ? h("div", { class: "pc-empty-box" }, h("span", null, "No styles match that search."), h("button", { type: "button", class: "pc-link", onclick: () => { a.setBlanksQuery(""); a.setBlanksCategory("all"); } }, "Clear filters")) : null,
        shown.map((p) => {
          const active = p.id === s.productId, weight = p.fabricWeight?.split("/")[0]?.trim();
          return h("button", { key: p.id, type: "button", class: cn("pc-blank", active && "is-active"), "aria-pressed": active, "aria-label": `${p.name}, ${p.styleNumber}${weight ? `, ${weight}` : ""}`, onclick: () => a.selectProduct(p.id) },
            h("span", { class: "pc-blank__stage" }, h("img", { src: a.thumbSrc(p), alt: p.name, loading: "lazy", draggable: false })),
            h("span", { class: "pc-blank__text" }, h("span", { class: "pc-blank__name" }, p.name), h("span", { class: "pc-blank__meta" }, p.styleNumber, weight ? ` · ${weight}` : "")));
        })),
      !expanded && hidden > 0 ? h("button", { type: "button", class: "pc-btn pc-btn--dark pc-btn--block", onclick: a.expandBlanks }, `Browse all ${s.products.length} styles`, svg(I.arrowRight)) : null));
}

// ---------------------------------------------------------------- right panel
export function renderRightPanel(s, a) {
  const hex = selectionHex(s.colorSel);
  const tabs = [
    { id: "color", label: s.labels.colorTab, meta: h("span", { class: "pc-tab__meta" }, h("span", { class: "pc-dot", style: { backgroundColor: hex } }), selectionName(s.colorSel)) },
    { id: "design", label: s.labels.designTab, meta: h("span", { class: "pc-tab__meta" }, s.layerTotal === 0 ? "Nothing yet" : `${s.layerTotal} ${s.layerTotal === 1 ? "layer" : "layers"}`) },
    { id: "quote", label: s.mode === "cart" ? s.labels.orderTab : s.labels.quoteTab,
      meta: h("span", { class: "pc-tab__meta" }, s.mode === "cart" ? (s.orderQty > 0 ? `${s.orderQty} pcs · ${s.money(s.price.subtotal)}` : "Pick sizes") : (s.quantityNumber ? `${s.quantityNumber} pcs` : "")) },
  ];
  return h("section", { class: "pc-panel pc-panel--right", "aria-label": "Design options" },
    h("div", { class: "pc-tabs", role: "tablist" }, tabs.map((t) => h("button", { key: t.id, type: "button", role: "tab", id: `pc-tab-${t.id}`, "aria-selected": s.tab === t.id, "aria-controls": `pc-tabpanel-${t.id}`, class: cn("pc-tab", s.tab === t.id && "is-active"), onclick: () => a.setTab(t.id) }, h("span", { class: "pc-tab__label" }, t.label), t.meta))),
    h("div", { class: "pc-panel__scroll", "data-scroller": "right", id: `pc-tabpanel-${s.tab}`, role: "tabpanel", "aria-labelledby": `pc-tab-${s.tab}` },
      s.tab === "color" ? renderColorTab(s, a) : s.tab === "design" ? renderDesignTab(s, a) : s.mode === "cart" ? renderOrderTab(s, a) : renderQuoteTab(s, a)));
}

// ---- Color ----
function renderColorTab(s, a) {
  const sel = s.colorSel, ui = s.colorUi, hex = selectionHex(sel);
  const picks = stockedPicksForProduct(s.product);
  const activeCode = sel.kind === "pantone" ? sel.color.code : null;
  const swatchGrid = (colors) => h("div", { class: "pc-swatches", role: "group" }, colors.map((c) => {
    const on = activeCode === c.code && hex === c.hex;
    return h("button", { key: c.code + c.hex, type: "button", class: cn("pc-swatch", on && "is-active"), "aria-pressed": on, "aria-label": `${c.name}, ${c.code}`, title: `${c.name} · ${c.code}`, style: { backgroundColor: c.hex }, onclick: () => a.setColor({ kind: "pantone", color: c }) }, on ? svg(I.check, "pc-swatch__check") : null);
  }));
  const results = searchPantone(ui.query);
  const visible = ui.family === "all" ? results : results.filter((c) => c.family === ui.family);
  const grouped = ui.query.trim() === "" && ui.family === "all";
  const hsv = ui.hsv ?? hexToHsv(hex);
  const nearest = nearestByDeltaE(hex, PANTONE_COLORS);
  const codeMatch = findPantoneByCode(ui.code), codeNearest = codeMatch ? null : (resolvePantoneQuery(ui.code)?.match === "nearest" ? resolvePantoneQuery(ui.code).color : null);
  const supportsEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  return h("div", { class: "pc-tabbody" },
    h("div", { class: "pc-row pc-row--between" },
      h("p", { class: "pc-strong" }, "Garment color"),
      h("div", { class: "pc-segment" }, [["library", "Pantone refs"], ["custom", "Custom HEX"]].map(([id, label]) => h("button", { key: id, type: "button", class: cn("pc-segment__btn", ui.mode === id && "is-active"), "aria-pressed": ui.mode === id, onclick: () => a.setColorMode(id) }, label)))),
    picks.length ? h("div", null, h("p", { class: "pc-overline-xs" }, "Core colors"),
      h("div", { class: "pc-row pc-row--wrap" }, picks.map((p) => { const on = sel.kind === "stocked" && sel.color.id === p.color.id; return h("button", { key: p.color.id, type: "button", class: cn("pc-pill", on && "is-active"), "aria-pressed": on, onclick: () => a.setColor({ kind: "stocked", color: p.color }) }, h("span", { class: "pc-dot pc-dot--lg", style: { backgroundColor: p.color.hex } }), p.label); }))) : null,
    ui.mode === "library"
      ? [
          h("div", { class: "pc-current" }, h("span", { class: "pc-current__chip", style: { backgroundColor: hex } }), h("div", { class: "pc-current__text" }, h("p", { class: "pc-strong pc-truncate" }, selectionName(sel)), h("p", { class: "pc-mono-meta pc-truncate" }, selectionSubtitle(sel)))),
          h("div", null, h("p", { class: "pc-overline-xs" }, "Popular"), swatchGrid(popularPantone())),
          h("div", { class: "pc-divider" }),
          h("div", { class: "pc-search" }, svg(I.search, "pc-search__icon"), h("input", { type: "search", class: "pc-input pc-input--search", value: ui.query, placeholder: "Search name or code (e.g. 286, navy)", "aria-label": "Search Pantone colors", oninput: (e) => a.setColorUi({ query: e.target.value }) })),
          h("div", { class: "pc-chips", role: "tablist", "aria-label": "Color groups" }, ["all", ...PANTONE_FAMILIES].map((f) => h("button", { key: f, type: "button", role: "tab", class: cn("pc-chip", ui.family === f && "is-active"), "aria-selected": ui.family === f, onclick: () => a.setColorUi({ family: f, query: "" }) }, f === "all" ? "All" : f))),
          h("div", { class: "pc-swatch-panel" },
            visible.length === 0 ? h("p", { class: "pc-muted pc-text-center" }, "No colors match that search.")
              : grouped ? PANTONE_FAMILIES.map((f) => { const list = visible.filter((c) => c.family === f); return list.length ? h("div", { key: f, class: "pc-swatch-group" }, h("button", { type: "button", class: "pc-overline pc-swatch-group__title", onclick: () => a.setColorUi({ family: f, query: "" }) }, f), swatchGrid(list)) : null; })
              : swatchGrid(visible)),
        ]
      : [
          h("div", { class: "pc-sv", role: "application", tabindex: 0, "aria-label": `Saturation and brightness. Saturation ${hsv.s}%, brightness ${hsv.v}%. Use arrow keys to adjust.`, style: { backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) },
            onpointerdown: (e) => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.dataset.drag = "1"; a.pickSV(e); },
            onpointermove: (e) => { if (e.currentTarget.dataset.drag) a.pickSV(e); },
            onpointerup: (e) => { delete e.currentTarget.dataset.drag; a.commitCustomHex(); },
            onkeydown: (e) => { const st = e.shiftKey ? 10 : 1; let { s: sat, v } = hsv; if (e.key === "ArrowLeft") sat -= st; else if (e.key === "ArrowRight") sat += st; else if (e.key === "ArrowUp") v += st; else if (e.key === "ArrowDown") v -= st; else return; e.preventDefault(); a.setHsv({ ...hsv, s: Math.min(100, Math.max(0, sat)), v: Math.min(100, Math.max(0, v)) }); } },
            h("div", { class: "pc-sv__white" }), h("div", { class: "pc-sv__black" }), h("span", { class: "pc-sv__thumb", style: { left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: hex } })),
          h("input", { type: "range", min: 0, max: 360, value: hsv.h, class: "pc-hue", "aria-label": "Hue", oninput: (e) => a.setHsv({ ...hsv, h: Number(e.target.value) }), onpointerup: a.commitCustomHex }),
          h("div", null, h("label", { class: "pc-overline-xs", for: "pc-pt-code" }, "Pantone code"),
            h("input", { id: "pc-pt-code", class: "pc-input", value: ui.code, spellcheck: false, autocomplete: "off", placeholder: "e.g. 286 C · 18-1664 · Classic Blue", oninput: (e) => a.setPantoneCode(e.target.value) }),
            ui.code.trim() ? (codeMatch ? h("p", { class: "pc-hint" }, h("span", { class: "pc-dot", style: { backgroundColor: codeMatch.hex } }), "Matched ", h("b", null, codeMatch.name), ` · ${codeMatch.code}`)
              : codeNearest ? h("p", { class: "pc-hint" }, h("span", { class: "pc-dot", style: { backgroundColor: codeNearest.hex } }), `No exact match for ${ui.code.trim()}. Closest in our library is `, h("b", null, codeNearest.name), ` · ${codeNearest.code}. `, h("button", { type: "button", class: "pc-link", onclick: () => a.setColor({ kind: "pantone", color: codeNearest }) }, "Use it"))
              : h("p", { class: "pc-hint" }, "No match in our library. Use the picker above, or the Pantone refs tab to browse.")) : null),
          h("div", { class: "pc-row" },
            h("span", { class: "pc-current__chip", style: { backgroundColor: hex } }),
            h("div", { class: "pc-hexfield" }, h("span", { class: "pc-hexfield__hash" }, "#"), h("input", { class: "pc-input pc-input--hex", value: (ui.hexDraft ?? hex).replace(/^#/, "").toUpperCase(), maxlength: 6, spellcheck: false, inputmode: "text", placeholder: "0F4C81", "aria-label": "Hex color code", oninput: (e) => a.setHexDraft(e.target.value), onblur: a.commitCustomHex })),
            supportsEyeDropper ? h("button", { type: "button", class: "pc-iconbtn", title: "Pick a color from anywhere on your screen", "aria-label": "Pick a color from anywhere on your screen", onclick: a.eyeDrop }, svg(I.pipette))
              : h("label", { class: "pc-iconbtn", title: "Open the system color picker" }, svg(I.pipette), h("input", { type: "color", value: hex, class: "pc-sr-only", "aria-label": "Open the system color picker", oninput: (e) => a.setCustomHex(e.target.value, true) }))),
          ui.recent.length ? h("div", null, h("p", { class: "pc-overline-xs" }, "Recent"), h("div", { class: "pc-row pc-row--wrap" }, ui.recent.map((r) => h("button", { key: r, type: "button", class: cn("pc-recent", sel.kind === "custom" && sel.hex.toLowerCase() === r.toLowerCase() && "is-active"), style: { backgroundColor: r }, title: r.toUpperCase(), "aria-label": `Reuse ${r.toUpperCase()}`, onclick: () => a.setCustomHex(r, false) })))) : null,
          nearest ? h("div", { class: "pc-nearest" }, h("span", { class: "pc-current__chip", style: { backgroundColor: nearest.entry.hex } }),
            h("div", { class: "pc-current__text" }, h("p", { class: "pc-overline-xs" }, nearest.deltaE <= 1 ? "Exact Pantone" : `Nearest Pantone · ΔE ${nearest.deltaE.toFixed(1)}`), h("p", { class: "pc-strong pc-truncate" }, nearest.entry.name), h("p", { class: "pc-mono-meta" }, nearest.entry.code)),
            nearest.deltaE <= 1 ? h("span", { class: "pc-pill is-active" }, svg(I.check), "Match") : h("button", { type: "button", class: "pc-pill", title: `Use ${nearest.entry.name} (${nearest.entry.code})`, onclick: () => a.setColor({ kind: "pantone", color: nearest.entry }) }, "Snap")) : null,
        ],
    h("p", { class: "pc-disclaimer" }, s.labels.colorDisclaimer));
}

// ---- Design ----
function renderDesignTab(s, a) {
  const layer = s.activeLayer, layers = s.sides[s.side];
  const hex = selectionHex(s.colorSel);
  const showStarters = layers.length === 0 && isApparelTopCategory(s.product.category) && s.side === "front";
  const addRow = h("div", { class: "pc-addrow" },
    h("button", { type: "button", class: "pc-btn pc-btn--outline pc-btn--block", onclick: a.openFilePicker }, svg(I.upload), "Upload artwork"),
    h("button", { type: "button", class: "pc-btn pc-btn--outline pc-btn--block", onclick: a.addText }, svg(I.type), "Add a text layer"));
  if (!layer) {
    return h("div", { class: "pc-tabbody" },
      addRow,
      h("p", { class: "pc-muted" }, layers.length > 0 ? "Pick a layer from the Layers rail to place, size, and restyle it." : `You can also drag a file straight onto the ${SIDE_LABEL[s.side].toLowerCase()} of the garment.`),
      layers.length === 0 ? h("div", { class: "pc-divider-top" }, h("p", { class: "pc-overline" }, "Start from"),
        h("div", { class: cn("pc-starters", showStarters && "pc-starters--grid") },
          s.sampleLogo ? h("button", { type: "button", class: "pc-starter pc-starter--logo", "aria-label": "Use the sample logo to try the tools", title: "Drop a sample logo on to try the tools", onclick: a.addSampleLogo }, h("img", { src: s.sampleLogo, alt: "" })) : null,
          showStarters ? TEXT_STARTERS.map((st) => h("button", { key: st.id, type: "button", class: "pc-starter", style: { fontFamily: s.fonts.cssFamily(st.fontId) }, onclick: () => a.applyStarter(st) }, st.label)) : null)) : null,
      renderFontLibrary(s, a));
  }
  const spots = s.layout.spots, p = layer.placement;
  const isSpot = (sp) => p.area === sp.areaId && Math.abs(p.cx - sp.cx) < 0.02 && Math.abs(p.cy - sp.cy) < 0.02 && Math.abs(p.width - sp.width) < 0.02;
  const idx = layers.findIndex((l) => l.id === layer.id), multi = layers.length > 1;
  const tool = (icon, label, onclick, opts = {}) => h("button", { type: "button", class: cn("pc-tool", opts.destructive && "pc-tool--danger"), disabled: opts.disabled, title: opts.title ?? label, "aria-label": label, onclick }, svg(icon), opts.iconOnly ? null : h("span", null, label));
  return h("div", { class: "pc-tabbody" },
    h("button", { type: "button", class: "pc-back", onclick: a.deselect }, svg(I.chevronLeft), layer.text ? "Text layer" : "Artwork layer", h("span", { class: "pc-back__meta" }, multi ? `${idx + 1} of ${layers.length}` : "")),
    h("p", { class: "pc-muted" }, "Drag on the garment to move; drag a corner to resize. Scroll to scale."),
    layer.text ? renderTextControls(s, a, layer) : null,
    h("div", { class: "pc-group" },
      h("p", { class: "pc-overline" }, "Layer & placement"),
      h("div", { class: "pc-tools" },
        tool(I.copy, "Duplicate", () => a.duplicateLayer(layer.id), { title: "Duplicate this layer (⌘/Ctrl+D)" }),
        tool(I.flip, "Flip", () => a.updateActivePlacement((pl) => ({ ...pl, flipX: !pl.flipX }))),
        tool(I.reset, "Reset", a.resetPlacement),
        multi ? tool(I.sendBack, "Send back", () => a.reorderLayer(-1), { iconOnly: true, title: "Send layer back (⌘/Ctrl+[)", disabled: idx <= 0 }) : null,
        multi ? tool(I.bringFront, "Bring forward", () => a.reorderLayer(1), { iconOnly: true, title: "Bring layer forward (⌘/Ctrl+])", disabled: idx >= layers.length - 1 }) : null,
        tool(I.trash, "Remove", () => a.removeLayer(layer.id), { destructive: true, title: "Remove this layer" })),
      h("p", { class: "pc-overline-xs" }, "Placement"),
      h("div", { class: "pc-spots" }, spots.map((sp) => h("button", { key: sp.id, type: "button", class: cn("pc-spot", isSpot(sp) && "is-active"), "aria-pressed": isSpot(sp), onclick: () => a.applySpot(sp) }, sp.label))),
      !layer.text ? renderSlider("Size", `${Math.round(100 * p.width)}%`, { min: 4, max: 92, step: 1, value: Math.round(100 * p.width), oninput: (e) => a.updateActivePlacement((pl) => ({ ...pl, width: Number(e.target.value) / 100 })) }) : null,
      renderSlider("Rotation", `${p.rotation}°`, { min: -180, max: 180, step: 1, value: p.rotation, oninput: (e) => a.updateActivePlacement((pl) => ({ ...pl, rotation: Number(e.target.value) })), ondblclick: () => a.updateActivePlacement((pl) => ({ ...pl, rotation: 0 })) })),
    !layer.text ? renderPreflight(s, a) : null,
    !layer.text && s.quality?.quality === "low" && !s.preflightReport ? h("p", { class: "pc-warn" }, "Heads up: the selected layer is low resolution at this print size. You can still submit (we'll flag it on your proof), or upload a larger file / shrink the print.") : null);
}
function renderSlider(label, value, props) {
  return h("div", { class: "pc-slider" }, h("label", { class: "pc-slider__label" }, label, h("span", { class: "pc-slider__value" }, value)), h("input", { type: "range", class: "pc-range", ...props }));
}
function renderTextControls(s, a, layer) {
  const t = layer.text, p = layer.placement;
  const swatchRow = (label, value, onPick, extra) => h("div", { class: "pc-inkrow" }, h("span", { class: "pc-inkrow__label" }, label),
    h("div", { class: "pc-inkrow__swatches", role: "radiogroup", "aria-label": `${label} color` }, extra?.leading, INK_COLORS.map((c) => { const on = value?.toLowerCase() === c.hex.toLowerCase(); return h("button", { key: c.id, type: "button", role: "radio", "aria-checked": on, "aria-label": `${label} ${c.label}`, title: c.label, class: cn("pc-ink", on && "is-active"), onclick: () => onPick(c.hex) }, h("span", { class: "pc-ink__dot", style: { backgroundColor: c.hex } })); }), extra?.trailing));
  return h("div", { class: "pc-group" },
    h("p", { class: "pc-overline" }, "Text"),
    h("textarea", { class: "pc-input pc-textarea", rows: 2, maxlength: 120, placeholder: "Your text", value: t.content, oninput: (e) => a.setText(layer.id, { content: e.target.value }) }),
    h("p", { class: "pc-hint" }, "Tip: double-click the text on the garment to retype it."),
    h("div", { class: "pc-row pc-row--between" },
      h("span", { class: "pc-strong-xs" }, "Text size"),
      h("div", { class: "pc-stepper" },
        h("button", { type: "button", class: "pc-stepper__btn", "aria-label": "Smaller text", onclick: () => a.updateActivePlacement((pl) => ({ ...pl, width: Math.min(0.92, Math.max(0.04, pl.width / 1.12)) })) }, h("span", { style: { fontSize: ".7rem", fontWeight: 600 } }, "A")),
        h("input", { type: "number", class: "pc-stepper__input", "aria-label": "Text size percent", min: 4, max: 92, step: 1, value: Math.round(100 * p.width), onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) a.updateActivePlacement((pl) => ({ ...pl, width: Math.min(0.92, Math.max(0.04, Math.round(v) / 100)) })); } }),
        h("span", { class: "pc-stepper__pct" }, "%"),
        h("button", { type: "button", class: "pc-stepper__btn", "aria-label": "Larger text", onclick: () => a.updateActivePlacement((pl) => ({ ...pl, width: Math.min(0.92, Math.max(0.04, pl.width * 1.12)) })) }, h("span", { style: { fontSize: "1rem", fontWeight: 600 } }, "A")))),
    h("div", { class: "pc-fonts", role: "radiogroup", "aria-label": "Typeface" },
      s.fonts.list().map((f) => h("button", { key: f.id, type: "button", role: "radio", "aria-checked": t.fontId === f.id, class: cn("pc-font", t.fontId === f.id && "is-active", f.source === "uploaded" && "pc-font--uploaded"), title: f.name, style: { fontFamily: f.cssFamily, fontWeight: Number(f.weight) }, onclick: () => a.setText(layer.id, { fontId: f.id }) }, f.label)),
      s.allowFontUpload ? h("label", { class: "pc-font pc-font--add", title: "Upload a TTF, OTF, WOFF or WOFF2 font" }, svg(I.font), "Upload font", h("input", { type: "file", accept: FONT_ACCEPT_ATTR, class: "pc-sr-only", onchange: (e) => { const f = e.target.files?.[0]; if (f) a.uploadFont(f, layer.id); e.target.value = ""; } })) : null),
    s.fonts.list().some((f) => f.source === "uploaded") ? h("p", { class: "pc-hint" }, "Uploaded fonts stay in this browser and travel with your request. ", h("button", { type: "button", class: "pc-link", onclick: () => a.setFontManager(!s.fontManager) }, s.fontManager ? "Hide" : "Manage")) : null,
    s.fontManager ? renderFontLibrary(s, a, true) : null,
    swatchRow("Ink", t.color, (hex) => a.setText(layer.id, { color: hex }), { trailing: h("label", { class: "pc-ink pc-ink--custom", title: "Custom ink color" }, h("span", { class: "pc-ink__dot pc-ink__dot--rainbow" }), h("input", { type: "color", value: t.color, class: "pc-sr-only", "aria-label": "Custom ink color", oninput: (e) => a.setText(layer.id, { color: e.target.value }) })) }),
    swatchRow("Outline", t.outline, (hex) => a.setText(layer.id, { outline: hex }), { leading: h("button", { type: "button", role: "radio", "aria-checked": !t.outline, "aria-label": "No outline", title: "No outline", class: cn("pc-ink", !t.outline && "is-active"), onclick: () => a.setText(layer.id, { outline: undefined }) }, h("span", { class: "pc-ink__dot pc-ink__dot--none" })) }),
    h("div", { class: "pc-two" },
      renderSlider("Curve", `${Math.round((t.arc ?? 0) * 100)}%`, { min: -100, max: 100, step: 5, value: Math.round((t.arc ?? 0) * 100), title: "Drag to arch the text; double-click to reset", oninput: (e) => a.setText(layer.id, { arc: Number(e.target.value) / 100 }), ondblclick: () => a.setText(layer.id, { arc: 0 }) }),
      renderSlider("Spacing", `${Math.round((t.spacing ?? 0) * 100)}%`, { min: 0, max: 40, step: 2, value: Math.round((t.spacing ?? 0) * 100), oninput: (e) => a.setText(layer.id, { spacing: Number(e.target.value) / 100 }) })));
}
function renderFontLibrary(s, a, compact = false) {
  const uploaded = s.fonts.list().filter((f) => f.source === "uploaded");
  if (!s.allowFontUpload && uploaded.length === 0) return null;
  return h("div", { class: cn("pc-fontlib", compact && "pc-fontlib--compact") },
    compact ? null : h("p", { class: "pc-overline" }, "Fonts"),
    compact ? null : h("p", { class: "pc-muted" }, `${s.fonts.list().length - uploaded.length} built-in typefaces. Upload your own TTF/OTF/WOFF to use it in text layers.`),
    uploaded.map((f) => h("div", { key: f.id, class: "pc-fontlib__row" }, h("span", { class: "pc-fontlib__sample", style: { fontFamily: f.cssFamily } }, f.name), h("button", { type: "button", class: "pc-iconbtn pc-iconbtn--sm", "aria-label": `Remove font ${f.name}`, title: "Remove", onclick: () => a.removeFont(f.id) }, svg(I.x)))),
    s.allowFontUpload && !compact ? h("label", { class: "pc-btn pc-btn--outline pc-btn--block" }, svg(I.font), "Upload a font", h("input", { type: "file", accept: FONT_ACCEPT_ATTR, class: "pc-sr-only", onchange: (e) => { const f = e.target.files?.[0]; if (f) a.uploadFont(f); e.target.value = ""; } })) : null);
}
const STATUS_CLASS = { ready: "is-ready", review: "is-review", fix: "is-fix" };
const SEV_CLASS = { pass: "is-pass", info: "is-info", warn: "is-warn", fail: "is-fail" };
function renderPreflight(s, a) {
  const r = s.preflightReport;
  return h("div", { class: "pc-divider-top" },
    h("div", { class: "pc-preflight", role: "status", "aria-live": "polite" },
      !r ? h("p", { class: "pc-preflight__pending" }, h("span", { class: "pc-preflight__dot is-pending" }), "Checking your artwork...")
        : [h("button", { type: "button", class: "pc-preflight__head", "aria-expanded": s.preflightOpen, onclick: () => a.setPreflightOpen(!s.preflightOpen) }, h("span", { class: cn("pc-preflight__dot", STATUS_CLASS[r.status]) }), h("span", { class: "pc-preflight__headline" }, r.headline), svg(I.chevronDown, s.preflightOpen ? "is-open" : "")),
           h("p", { class: "pc-preflight__facts" }, r.facts.join(" · ")),
           s.preflightOpen ? h("div", { class: "pc-preflight__body" },
             h("ul", { class: "pc-preflight__list" }, r.findings.map((f) => h("li", { key: f.id, class: "pc-preflight__item" }, h("span", { class: cn("pc-preflight__dot", SEV_CLASS[f.severity]) }), h("div", null, h("p", { class: "pc-preflight__title" }, f.title), f.detail ? h("p", { class: "pc-preflight__detail" }, f.detail) : null)))),
             h("p", { class: "pc-overline-xs" }, "Method fit"),
             h("div", { class: "pc-row pc-row--wrap" }, r.methodFits.map((m) => h("span", { key: m.method, class: cn("pc-fit", `pc-fit--${m.status}`), title: m.note ?? "" }, m.label))),
             h("p", { class: "pc-hint" }, "Automatic check. We review every file by hand and confirm details on your proof.")) : null]),
    s.contrastSuggestion ? h("button", { type: "button", class: "pc-suggest", onclick: () => a.setColor({ kind: "stocked", color: s.contrastSuggestion.color }) }, h("span", { class: "pc-dot pc-dot--lg", style: { backgroundColor: s.contrastSuggestion.hex } }), h("b", null, `Switch garment to ${s.contrastSuggestion.label}`), h("span", { class: "pc-muted" }, "so the art pops")) : null);
}

// ---- Quote ----
function renderQuoteTab(s, a) {
  const qty = s.quantityNumber;
  return h("form", { class: "pc-tabbody", id: "pc-request-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); a.submit(); } },
    h("div", null, h("p", { class: "pc-overline" }, "Decoration"),
      h("div", { class: "pc-methods", role: "radiogroup", "aria-label": "Decoration method" }, METHODS.map((m) => h("button", { key: m.id, type: "button", role: "radio", "aria-checked": s.method === m.id, class: cn("pc-method", s.method === m.id && "is-active"), onclick: () => a.setMethod(m.id) }, h("span", { class: "pc-method__label" }, m.label), h("span", { class: "pc-method__note" }, m.note))))),
    h("div", null, h("label", { class: "pc-strong", for: "pc-qty" }, s.labels.quantityLabel),
      h("div", { class: "pc-qtys", role: "group", "aria-label": "Quantity shortcuts" }, PRICE_BREAKS.map((n) => h("button", { key: n, type: "button", class: cn("pc-qty", s.quantity === String(n) && "is-active"), "aria-pressed": s.quantity === String(n), onclick: () => a.setQuantity(String(n)) }, n))),
      h("p", { class: "pc-hint" }, s.labels.quantityHint),
      h("input", { id: "pc-qty", class: "pc-input", inputmode: "numeric", maxlength: 8, value: s.quantity, placeholder: "e.g. 48", oninput: (e) => a.setQuantity(e.target.value) })),
    h("div", null, h("label", { class: "pc-strong", for: "pc-notes" }, "Notes (optional)"),
      h("textarea", { id: "pc-notes", class: "pc-input pc-textarea", rows: 3, maxlength: 2000, value: s.notes, placeholder: "Sizes, garment Pantone color, ink colors, deadline, placement...", oninput: (e) => a.setNotes(e.target.value) }),
      h("p", { class: "pc-hint" }, "Want a specific garment color? Add the Pantone code here and we'll match it on your proof.")),
    s.labels.emailLabel ? h("div", null, h("label", { class: "pc-strong", for: "pc-email" }, s.labels.emailLabel),
      h("input", { id: "pc-email", class: "pc-input", type: "email", inputmode: "email", autocomplete: "email", maxlength: 254, value: s.email, placeholder: "you@company.com", oninput: (e) => a.setEmail(e.target.value) }),
      h("p", { class: "pc-hint" }, s.labels.emailHint)) : null,
    s.layerTotal > 0 ? h("p", { class: "pc-hint" }, `${s.layerTotal} ${s.layerTotal === 1 ? "placement" : "placements"} on this design${s.sides.back.length > 0 ? " (front + back)" : ""}.`) : h("p", { class: "pc-hint" }, s.labels.noArtworkHint),
    qty != null && qty > 0 && qty < 25 && (s.method === "screen" || s.method === "embroidery") ? h("p", { class: "pc-hint" }, "Setup is heavy at this qty — around 25 pieces the unit price starts making sense.") : null,
    s.designs.length > 1 ? h("p", { class: "pc-hint" }, `Sends the design on the stage (design ${s.activeDesignIndex + 1} of ${s.designs.length}) with its artwork. Your other designs stay saved here and are listed in the request notes so we can quote everything together.`) : null,
    h("button", { type: "submit", class: "pc-btn pc-btn--primary pc-btn--block pc-btn--lg pc-only-mobile", disabled: s.submitting, "aria-busy": s.submitting }, s.submitting ? [svg(I.loader, "pc-spin"), "Opening your request..."] : a.submitLabel()),
    h("p", { class: "pc-hint pc-divider-top" }, s.labels.submitFootnote));
}


// ---------------------------------------------------------------- order tab (cart mode)
function renderMethods(s, a) {
  return h("div", null, h("p", { class: "pc-overline" }, "Decoration"),
    h("div", { class: "pc-methods", role: "radiogroup", "aria-label": "Decoration method" }, METHODS.map((m) =>
      h("button", { key: m.id, type: "button", role: "radio", "aria-checked": s.method === m.id, class: cn("pc-method", s.method === m.id && "is-active"), onclick: () => a.setMethod(m.id) },
        h("span", { class: "pc-method__label" }, m.label), h("span", { class: "pc-method__note" }, m.note)))));
}

function renderSizeRun(s, a) {
  if (!s.sizeRows.length) return null;
  return h("div", null,
    h("div", { class: "pc-row pc-row--between" },
      h("label", { class: "pc-strong" }, s.labels.sizeLabel),
      s.sizeTotal > 0 ? h("button", { type: "button", class: "pc-link", onclick: a.clearSizes }, "Clear") : null),
    h("div", { class: "pc-sizes" }, s.sizeRows.map((r) =>
      h("div", { key: r.size, class: cn("pc-size", r.quantity > 0 && "is-filled", !r.available && "is-oos") },
        h("span", { class: "pc-size__label" }, r.size),
        h("div", { class: "pc-size__ctrl" },
          h("button", { type: "button", class: "pc-size__btn", "aria-label": `One fewer ${r.size}`, disabled: r.quantity === 0, onclick: () => a.bumpSize(r.size, -1) }, "−"),
          h("input", { type: "number", class: "pc-size__input", min: 0, max: 9999, inputmode: "numeric", "aria-label": `Quantity for size ${r.size}`, value: String(r.quantity), oninput: (e) => a.setSize(r.size, e.target.value) }),
          h("button", { type: "button", class: "pc-size__btn", "aria-label": `One more ${r.size}`, disabled: !r.available, onclick: () => a.bumpSize(r.size, 1) }, "+")),
        h("span", { class: "pc-size__price" }, r.available ? (r.unit > 0 ? s.money(r.unit) : "—") : "Sold out")))),
    h("div", { class: "pc-row pc-row--wrap pc-quickfill" },
      h("span", { class: "pc-hint" }, "Quick fill:"),
      PRICE_BREAKS.filter((n) => n >= (s.price.quantity > 0 ? 0 : 0)).map((n) =>
        h("button", { key: n, type: "button", class: "pc-qty pc-qty--sm", onclick: () => a.spreadSizes(n) }, n))),
    h("p", { class: "pc-hint" }, s.labels.sizeHint));
}

function renderPriceBreakdown(s, a) {
  const p = s.price;
  if (p.quantity === 0) return h("p", { class: "pc-muted pc-divider-top" }, "Add quantities above to see pricing.");
  const group = (kind) => p.lines.filter((l) => l.kind === kind && !(kind === "garment" && !(l.unit > 0)));
  const row = (l) => h("div", { key: l.id, class: "pc-price__row" },
    h("span", { class: "pc-price__label" }, l.label, l.meta ? h("span", { class: "pc-price__meta" }, l.meta) : null),
    h("span", { class: "pc-price__unit" }, l.oneOff ? (l.qty > 1 ? `${s.money(l.unit)} × ${l.qty} · one-off` : "one-off") : `${s.money(l.unit)} × ${l.qty}`),
    h("span", { class: "pc-price__total" }, s.money(l.total)));
  return h("div", { class: "pc-price" },
    h("p", { class: "pc-overline" }, "Price"),
    [...group("garment"), ...group("decoration"), ...group("surcharge"), ...group("setup")].map(row),
    h("div", { class: "pc-price__sum" },
      h("span", null, "Subtotal"),
      h("span", { class: "pc-price__big" }, s.money(p.subtotal))),
    h("p", { class: "pc-price__unitline" }, `${s.money(p.unitPrice)} per piece · ${p.quantity} ${p.quantity === 1 ? "piece" : "pieces"}`),
    p.nextBreak ? h("p", { class: "pc-price__break" }, `Order ${p.nextBreak.qty}+ and each piece drops to ${s.money(p.nextBreak.unitPrice)} — saving ${s.money(p.nextBreak.saving)} each.`) : null,
    p.notes.map((n, i) => h("p", { key: `n${i}`, class: cn("pc-hint", n.level === "warn" && "pc-hint--warn") }, n.text)),
    p.blockers.map((b) => h("p", { key: b.id, class: "pc-warn" }, b.text,
      b.quoteInstead ? [" ", h("button", { type: "button", class: "pc-link", onclick: a.requestQuoteInstead }, "Request a quote instead")] : null)));
}

function renderOrderTab(s, a) {
  return h("form", { class: "pc-tabbody", id: "pc-request-form", novalidate: true, onsubmit: (e) => { e.preventDefault(); a.submit(); } },
    renderMethods(s, a),
    renderSizeRun(s, a),
    renderPriceBreakdown(s, a),
    h("div", null, h("label", { class: "pc-strong", for: "pc-notes" }, "Notes for production (optional)"),
      h("textarea", { id: "pc-notes", class: "pc-input pc-textarea", rows: 2, maxlength: 2000, value: s.notes, placeholder: "Deadline, thread colours, packing…", oninput: (e) => a.setNotes(e.target.value) })),
    h("button", { type: "submit", class: "pc-btn pc-btn--primary pc-btn--block pc-btn--lg pc-only-mobile", disabled: s.submitting || s.price.quantity === 0 || s.price.blockers.length > 0, "aria-busy": s.submitting },
      s.submitting ? [svg(I.loader, "pc-spin"), s.labels.addingToCart] : [svg(I.cart), `${s.labels.addToCart} · ${s.money(s.price.subtotal)}`]),
    h("p", { class: "pc-hint pc-divider-top" }, s.labels.cartFootnote ?? "Artwork is checked by hand before production. We email a proof before anything is printed."));
}

// ---------------------------------------------------------------- bottom bar
export function renderBottomBar(s, a) {
  const hex = selectionHex(s.colorSel);
  return h("div", { class: "pc-bar" },
    h("button", { type: "button", class: "pc-bar__chip", onclick: () => a.jumpTo("blank") },
      h("span", { class: "pc-bar__thumb" }, h("img", { src: s.mockup.front, alt: "", draggable: false })),
      h("span", { class: "pc-bar__text" }, h("span", { class: "pc-bar__title" }, s.product.name), h("span", { class: "pc-bar__meta" }, `${s.product.styleNumber} · Change blank`))),
    h("span", { class: "pc-bar__sep" }),
    h("button", { type: "button", class: "pc-bar__chip", onclick: () => a.jumpTo("color") },
      h("span", { class: "pc-dot pc-dot--xl", style: { backgroundColor: hex } }),
      h("span", { class: "pc-bar__text" }, h("span", { class: "pc-bar__title" }, selectionName(s.colorSel)), h("span", { class: "pc-bar__meta" }, "Change color"))),
    s.mode === "cart" && s.price.quantity > 0 ? h("button", { type: "button", class: "pc-bar__chip pc-bar__chip--price", onclick: () => a.jumpTo("quote") },
      h("span", { class: "pc-bar__text" },
        h("span", { class: "pc-bar__title" }, `${s.money(s.price.subtotal)}`),
        h("span", { class: "pc-bar__meta" }, `${s.price.quantity} pcs · ${s.money(s.price.unitPrice)} each`))) : null,
    h("div", { class: "pc-bar__actions" },
      h("button", { type: "button", class: "pc-btn pc-btn--outline", disabled: s.share === "working" || s.layerTotal === 0, "aria-busy": s.share === "working", "aria-label": "Share a link to this design", title: s.layerTotal === 0 ? "Add artwork or text first, then share the design" : "Copy a link to this design", onclick: a.share },
        svg(s.share === "working" ? I.loader : I.link, s.share === "working" ? "pc-spin" : ""), h("span", { class: "pc-hide-sm" }, s.share === "copied" ? "Link copied" : s.share === "failed" ? "Try again" : s.share === "working" ? "Sharing..." : "Share")),
      h("button", { type: "button", class: "pc-btn pc-btn--outline", disabled: s.saving || s.layerTotal === 0, "aria-busy": s.saving, "aria-label": "Download mockup", title: s.layerTotal === 0 ? "Add artwork or text first, then download the mockup" : "Download a PNG mockup of this design (every side)", onclick: () => a.download("studio") },
        svg(s.saving ? I.loader : I.download, s.saving ? "pc-spin" : ""), h("span", { class: "pc-hide-sm" }, s.saving ? "Saving..." : "Download")),
      h("button", { type: "button", class: "pc-btn pc-btn--outline", onclick: a.openPreview }, svg(I.eye), "Preview"),
      h("button", { type: "submit", form: "pc-request-form", class: "pc-btn pc-btn--primary pc-btn--submit", disabled: s.submitting || (s.mode === "cart" && (s.price.quantity === 0 || s.price.blockers.length > 0)), "aria-busy": s.submitting, onclick: (e) => { e.preventDefault(); a.submit(); } },
        s.submitting ? [svg(I.loader, "pc-spin"), s.mode === "cart" ? s.labels.addingToCart : "Opening your request..."]
          : s.mode === "cart" ? [svg(I.cart), a.submitLabel(), s.price.quantity > 0 ? h("span", { class: "pc-btn__price" }, s.money(s.price.subtotal)) : null]
          : a.submitLabel())),
    s.shareExpires && s.share !== "working" ? h("p", { class: "pc-bar__status", role: "status" },
      s.shareLink ? ["Copy your share link: ", h("input", { class: "pc-input pc-input--share", readonly: true, value: s.shareLink, "aria-label": "Share link", onclick: (e) => e.target.select() })] : "Link copied. Anyone with this link can view your design",
      s.shareLink ? null : s.shareExpires === true ? "." : [" until ", h("b", null, s.shareExpires), ", then it stops working."]) : null);
}

// ---------------------------------------------------------------- preview modal + toasts
export function renderPreviewModal(s, a) {
  if (!s.preview.open) return null;
  const p = s.preview;
  return h("div", { class: "pc-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "pc-preview-title", onclick: a.closePreview },
    h("div", { class: "pc-modal__card", tabindex: -1, onclick: (e) => e.stopPropagation() },
      h("div", { class: "pc-row pc-row--between pc-row--top" },
        h("div", null, h("h2", { class: "pc-modal__title", id: "pc-preview-title" }, "Final preview"), h("p", { class: "pc-muted" }, `${s.product.name} · ${selectionName(s.colorSel)}. We confirm exact placement and colors on your proof.`)),
        h("button", { type: "button", class: "pc-iconbtn pc-iconbtn--ghost", "aria-label": "Close preview", onclick: a.closePreview }, svg(I.x))),
      h("div", { class: "pc-modal__body", "aria-live": "polite" },
        p.busy ? h("p", { class: "pc-muted pc-text-center pc-modal__status", role: "status" }, svg(I.loader, "pc-spin"), "Rendering your mockup...")
          : p.failed || (p.images.length === 0 && s.layerTotal > 0) ? h("div", { class: "pc-text-center pc-modal__status", role: "alert" }, h("p", { class: "pc-strong" }, "Couldn't render the preview."), h("p", { class: "pc-muted" }, "Your design is safe on the stage. This is usually a one-off, so try again."), h("button", { type: "button", class: "pc-btn pc-btn--outline", onclick: a.openPreview }, svg(I.reset), "Try again"))
          : p.images.length === 0 ? h("p", { class: "pc-muted pc-text-center pc-modal__status" }, "Add at least one image to preview your design.")
          : h("div", { class: cn("pc-modal__grid", p.images.length > 1 && "pc-modal__grid--2") }, p.images.map((img) => h("figure", { key: img.label, class: "pc-modal__fig" }, h("div", { class: "pc-modal__imgbox" }, h("img", { src: img.url, alt: `${img.label} mockup` })), h("figcaption", { class: "pc-modal__cap" }, img.label))))),
      h("div", { class: "pc-modal__foot" },
        h("button", { type: "button", class: "pc-btn pc-btn--outline", disabled: p.images.length === 0 || s.saving, onclick: () => a.download("preview") }, svg(s.saving ? I.loader : I.download, s.saving ? "pc-spin" : ""), s.saving ? "Preparing..." : "Download mockup"),
        h("button", { type: "button", class: "pc-btn pc-btn--primary", onclick: a.closePreview }, "Looks good"))));
}
export function renderResultModal(s, a) {
  if (!s.result) return null;
  const r = s.result;
  return h("div", { class: "pc-modal", role: "dialog", "aria-modal": "true", onclick: a.closeResult },
    h("div", { class: "pc-modal__card pc-modal__card--sm", onclick: (e) => e.stopPropagation() },
      h("div", { class: "pc-row pc-row--between pc-row--top" }, h("h2", { class: "pc-modal__title" }, r.title), h("button", { type: "button", class: "pc-iconbtn pc-iconbtn--ghost", "aria-label": "Close", onclick: a.closeResult }, svg(I.x))),
      h("p", { class: "pc-muted" }, r.message),
      r.previewUrl ? h("div", { class: "pc-modal__imgbox pc-modal__imgbox--mt" }, h("img", { src: r.previewUrl, alt: "Design mockup" })) : null,
      r.details ? h("pre", { class: "pc-code" }, r.details) : null,
      h("div", { class: "pc-modal__foot" }, h("button", { type: "button", class: "pc-btn pc-btn--primary", onclick: a.closeResult }, "Done"))));
}
export function renderToasts(s, a) {
  return h("div", { class: "pc-toasts", role: "status", "aria-live": "polite", "aria-atomic": "true" },
    s.undo.design ? h("div", { class: "pc-toast" }, h("span", null, "Design removed"), h("button", { type: "button", class: "pc-toast__btn", onclick: a.undoRemoveDesign }, svg(I.reset), "Undo")) : null,
    s.undo.layer ? h("div", { class: "pc-toast" }, h("span", null, "Layer removed"), h("button", { type: "button", class: "pc-toast__btn", onclick: a.undoRemoveLayer }, svg(I.reset), "Undo")) : null);
}
export function renderAlerts(s, a) {
  if (!s.error && !s.largeArtNotice) return null;
  return h("div", { class: "pc-alerts" },
    s.error ? h("p", { class: "pc-alert", role: "alert" }, h("span", null, s.error), h("button", { type: "button", class: "pc-notice__x", "aria-label": "Dismiss", onclick: a.dismissError }, svg(I.x))) : null,
    s.largeArtNotice ? h("div", { class: "pc-notice", role: "status" }, h("span", null, "Heads up: large artwork stays in this session but is not saved to your draft, so it clears if you refresh. Submit your request to keep it safe."), h("button", { type: "button", class: "pc-notice__x", "aria-label": "Dismiss", onclick: a.dismissLargeArt }, svg(I.x))) : null);
}
export function renderSideTabs(s, a) {
  if (s.sideList.length < 2) return null;
  return h("div", { class: "pc-sides", role: "tablist", "aria-label": "Garment side" }, s.sideList.map((side) => {
    const active = side === s.side, n = s.sides[side].length;
    return h("button", { key: side, type: "button", role: "tab", id: `pc-side-${side}`, "aria-selected": active, tabindex: active ? 0 : -1, class: cn("pc-side", active && "is-active"), onclick: () => a.setSide(side),
      onkeydown: (e) => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); const i = s.sideList.indexOf(side); const next = s.sideList[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + s.sideList.length) % s.sideList.length]; a.setSide(next); document.getElementById(`pc-side-${next}`)?.focus(); } },
      h("span", { class: "pc-side__stage" }, h("img", { src: s.mockup[side] ?? s.mockup.front, alt: "", draggable: false, class: cn(s.mirrored[side] && "is-mirrored") }),
        s.sides[side].map((l) => { const aspect = l.artwork.naturalW > 0 ? l.artwork.naturalH / l.artwork.naturalW : 1, hf = l.placement.width * aspect; return h("img", { key: l.id, src: l.artwork.url, alt: "", draggable: false, class: "pc-side__layer", style: { left: `${(l.placement.cx - l.placement.width / 2) * 100}%`, top: `${(l.placement.cy - hf / 2) * 100}%`, width: `${100 * l.placement.width}%`, height: `${100 * hf}%`, transform: `rotate(${l.placement.rotation}deg)${l.placement.flipX ? " scaleX(-1)" : ""}` } }); })),
      h("span", { class: "pc-side__label" }, SIDE_LABEL[side]),
      n > 0 ? h("span", { class: "pc-side__count" }, n) : null);
  }));
}
export function renderLayersRail(s, a) {
  const layers = s.sides[s.side];
  return h("div", { class: "pc-layers" },
    h("p", { class: "pc-overline pc-layers__label" }, "Layers"),
    h("div", { class: "pc-layers__list" },
      layers.map((l, i) => { const active = l.id === s.activeLayerId; return h("div", { key: l.id, class: "pc-layerchip-wrap" },
        h("button", { type: "button", class: cn("pc-layerchip", active && "is-active"), "aria-pressed": active, "aria-label": `Select layer ${i + 1}${l.text ? " (text)" : ""}`, style: l.text && relativeLuminance(l.text.color) > 0.6 ? { backgroundColor: "#3f3f46" } : null, onclick: () => a.selectLayer(l.id) }, h("img", { src: l.artwork.url, alt: "", draggable: false })),
        h("button", { type: "button", class: "pc-layerchip__x", "aria-label": `Remove layer ${i + 1}`, onclick: () => a.removeLayer(l.id) }, svg(I.x))); }),
      h("button", { type: "button", class: "pc-layerchip pc-layerchip--add", "aria-label": "Add artwork files", onclick: a.openFilePicker }, svg(I.imagePlus)),
      h("button", { type: "button", class: "pc-layerchip pc-layerchip--add", "aria-label": "Add a text layer", onclick: a.addText }, svg(I.type))));
}
