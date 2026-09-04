// Piobox Customizer — embeddable garment design studio.
//
//   import { mount } from "./piobox-customizer/customizer.js";
//   const studio = mount(document.getElementById("studio"), { products, photoBase, fontBase, onSubmit });
//
// See README.md for the full config reference.
import { DEFAULT_CATALOG } from "./data/catalog.js";
import { PHOTO_FRAMES } from "./data/photo-frames.js";
import { h, morph } from "./ui/dom.js";
import { createStage } from "./ui/stage.js";
import { renderDesignsRail, renderBlanks, renderRightPanel, renderBottomBar, renderPreviewModal, renderResultModal, renderToasts, renderAlerts, renderSideTabs, renderLayersRail } from "./ui/panels.js";
import { FontRegistry } from "./core/fonts.js";
import { renderTextLayer, isTextEmpty, sanitizeTextSpec, TEXT_MAX_CHARS } from "./core/text.js";
import { probeAnyArtworkFile, probeArtworkFile, isAcceptedArtwork, isConvertibleArtwork, MAX_ARTWORK_BYTES, PrintFileError } from "./core/artwork.js";
import { garmentPrintLayout, constrainPlacementToAreas, defaultPlacementForLayout, remapPlacementBetweenLayouts, resolvePlacementArea, placementAreaLabel, sanitizePlacement, estimateArtworkQuality, STAGE_INCHES } from "./core/placements.js";
import { selectionHex, selectionName, selectionNotesLabel, serializeSelection, deserializeSelection, defaultStockedSelection, stockedPicksForProduct, stockedKindForHex, resolveColorHint, PANTONE_COLORS, findPantoneByCode } from "./core/pantone.js";
import { normalizeHex, hexToHsv, hsvToHex, relativeLuminance, nearestByDeltaE } from "./core/color.js";
import { prewarmGarment, recolorGarment, recolorCapGarment, peekRecolored, registerPhotoProtection } from "./core/recolor.js";
import { analyzeArtwork, evaluatePreflight, suggestContrastingGarment } from "./core/preflight.js";
import { composeMockupPng, composeFinalPreviewPng, blobToPreviewDataUrl } from "./core/compose.js";
import { readDraft, writeDraft, fileToDraftArtwork, dataUrlToBlob, encodeShare, decodeShare, DESIGN_RAIL_MAX } from "./core/draft.js";
import { DEFAULT_PRICING, priceDesign, inkColorsForLayer, formatMoney, garmentIsWhiteFromSelection } from "./core/pricing.js";

const SIDES = ["front", "back"];
const SIDE_LABEL = { front: "Front", back: "Back" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let uid = 0;
const newId = (p) => `${p}-${++uid}-${Math.random().toString(36).slice(2, 8)}`;

export const DEFAULT_LABELS = {
  blanks: "Blanks",
  colorTab: "Color",
  designTab: "Artwork & text",
  quoteTab: "Request a quote",
  orderTab: "Size & price",
  submit: "Get pricing for this blank",
  submitWithDesign: "Get pricing for this design",
  addToCart: "Add to cart",
  addingToCart: "Adding to cart...",
  sizeLabel: "How many of each size?",
  sizeHint: "Pick your size run. Pricing updates as the quantity grows.",
  quantityLabel: "How many pieces?",
  quantityHint: "Quantity cutoffs where per-piece pricing usually improves. We confirm exact pricing on your written quote.",
  emailLabel: "Save your progress (optional)",
  emailHint: "We'll email you a link so you can pick up this design later. That's all it does.",
  noArtworkHint: "No artwork yet? Continue with the colored blank and send your design later.",
  submitFootnote: "Last step: add your contact details on the next screen and we'll send pricing and a production proof. No payment now.",
  colorDisclaimer: "On-screen swatches and garment previews are visual approximations. Final color is confirmed against a physical Pantone reference or approved production sample.",
};

function mergePricing(custom) {
  const base = DEFAULT_PRICING;
  return {
    ...base, ...custom,
    sizeBands: custom.sizeBands ?? base.sizeBands,
    blankSellPrices: custom.blankSellPrices ?? base.blankSellPrices,
    customColor: custom.customColor === null ? null : { ...(base.customColor ?? {}), ...(custom.customColor ?? {}) },
    methods: Object.fromEntries(Object.entries({ ...base.methods, ...(custom.methods ?? {}) }).map(([k, v]) => [k, { ...(base.methods[k] ?? {}), ...v }])),
  };
}

export function mount(host, config = {}) {
  const cfg = {
    products: config.products ?? DEFAULT_CATALOG,
    photoBase: (config.photoBase ?? "assets/photos").replace(/\/$/, ""),
    fontBase: (config.fontBase ?? "assets/fonts").replace(/\/$/, ""),
    photoFrames: { ...PHOTO_FRAMES, ...(config.photoFrames ?? {}) },
    fonts: config.fonts ?? [],
    allowFontUpload: config.allowFontUpload ?? true,
    sampleLogo: config.sampleLogo ?? null,
    draftKey: config.draftKey ?? "piobox-customizer-draft-v1",
    persistDraft: config.persistDraft ?? true,
    initialProductId: config.initialProductId ?? new URLSearchParams(location.search).get("style") ?? null,
    initialColor: config.initialColor ?? new URLSearchParams(location.search).get("color") ?? null,
    labels: { ...DEFAULT_LABELS, ...(config.labels ?? {}) },
    onSubmit: config.onSubmit ?? null,
    onShare: config.onShare ?? null,
    onChange: config.onChange ?? null,
    onEvent: config.onEvent ?? null,
    pdfjsUrl: config.pdfjsUrl, pdfjsWorkerUrl: config.pdfjsWorkerUrl,
    defaultQuantity: String(config.defaultQuantity ?? 1),
    defaultMethod: config.defaultMethod ?? "dtg",
    // "cart" shows live pricing and an Add to cart button; "quote" keeps the enquiry flow.
    mode: config.mode ?? (config.pricing ? "cart" : "quote"),
    pricing: config.pricing ? mergePricing(config.pricing) : DEFAULT_PRICING,
    modal: config.modal ?? false,
    onClose: config.onClose ?? null,
  };
  if (config.photoProtection) registerPhotoProtection(config.photoProtection);
  const fonts = new FontRegistry({ fontBase: cfg.fontBase, fonts: cfg.fonts, allowUpload: cfg.allowFontUpload });
  const emit = (name, data) => { try { cfg.onEvent?.(name, data); } catch { /* ignore */ } };

  // ------------------------------------------------------------------ state
  const products = cfg.products;
  const findProduct = (idOrCode) => { if (!idOrCode) return null; const q = String(idOrCode).toLowerCase(); return products.find((p) => p.id.toLowerCase() === q || p.styleNumber.toLowerCase() === q || p.styleNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-") === q) ?? null; };
  const initialProduct = findProduct(cfg.initialProductId) ?? products[0];
  const S = {
    products, productId: initialProduct.id, product: initialProduct,
    designs: [{ id: newId("design"), productId: initialProduct.id, colorSel: defaultStockedSelection(initialProduct), stash: null, pending: null }], activeDesignId: null,
    colorSel: defaultStockedSelection(initialProduct),
    colorUi: { mode: "library", query: "", family: "all", code: "", hsv: null, hexDraft: null, recent: [] },
    sides: { front: [], back: [] }, side: "front", activeLayerId: null,
    method: cfg.defaultMethod, quantity: cfg.defaultQuantity, notes: "", email: "",
    sizes: {}, mode: cfg.mode, pricing: cfg.pricing, open: !cfg.modal,
    // Collapse the blanks column when the product is already chosen (one product, or a pop-out).
    blanksCollapsed: config.collapseBlanks ?? (config.products?.length === 1 || !!config.modal),
    tab: "design", blanksQuery: "", blanksCategory: "all", blanksExpanded: false,
    error: null, notice: null, largeArtNotice: false,
    preview: { open: false, busy: false, images: [], failed: false }, result: null,
    share: "idle", shareExpires: null, shareLink: null, saving: false, submitting: false,
    undo: { layer: null, design: null },
    preflight: null, preflightOpen: false, fontManager: false,
    labels: cfg.labels, fonts, allowFontUpload: cfg.allowFontUpload, sampleLogo: cfg.sampleLogo,
  };
  S.activeDesignId = S.designs[0].id;
  const mirrors = new Map(); // layerId → draft artwork (data url) or null
  const analyses = new Map(); // artwork url → preflight analysis (drives ink-colour pricing)
  const objectUrls = new Set();
  let generation = 0, textTimer = null, textToken = 0, undoLayerTimer = null, undoDesignTimer = null, handedOff = false;
  const recolorState = new Map(); // key → data url

  // ------------------------------------------------------------------ derived helpers
  const photoUrl = (name) => (name ? (/^(https?:|data:|blob:|\/)/.test(name) ? name : `${cfg.photoBase}/${name}`) : null);
  const frameFor = (name) => (name ? cfg.photoFrames[name.split("?")[0].split("/").pop()] : undefined);
  const hex = () => selectionHex(S.colorSel);
  function stockedPhoto(product, side) {
    const sel = S.colorSel;
    const map = side === "back" ? product.backColorwayImages : product.colorwayImages;
    if (sel.kind === "stocked" && map?.[sel.color.id]) return map[sel.color.id];
    const kind = stockedKindForHex(selectionHex(sel));
    if (kind === "white") return side === "back" ? product.photos.back : product.photos.front;
    if (kind === "black") return side === "back" ? product.photos.backBlack : product.photos.frontBlack;
    return null;
  }
  const basePhoto = (product, side) => (side === "back" ? product.photos.back : product.photos.front);
  const framePhoto = (product, side) => stockedPhoto(product, side) ?? basePhoto(product, side) ?? product.photos.front;
  const hasBack = (product) => !!product.photos.back;
  function layoutFor(product, side) {
    return garmentPrintLayout({ category: product.category, name: product.name, fit: product.fit, side, frame: frameFor(framePhoto(product, side)), mirrored: side === "back" && !hasBack(product) });
  }
  // Resolves the src shown on the stage for a side; kicks off recolouring if needed.
  function mockupFor(side) {
    const p = S.product, stocked = stockedPhoto(p, side);
    if (stocked) return photoUrl(stocked);
    const base = basePhoto(p, side);
    if (!base) return null;
    const src = photoUrl(base), mask = side === "front" && p.photos.frontMask ? photoUrl(p.photos.frontMask) : undefined, color = hex();
    const key = `${p.recolorMode ?? "garment"}|${color}|${src}|${mask ?? ""}`;
    const cached = recolorState.get(key) ?? (p.recolorMode === "cap" ? null : peekRecolored(src, color, mask));
    if (cached) return cached;
    if (!recolorState.has(key)) {
      recolorState.set(key, null);
      const job = p.recolorMode === "cap" ? recolorCapGarment(src, color) : recolorGarment(src, color, mask);
      job.then((url) => { recolorState.set(key, url ?? src); schedule(); }).catch(() => { recolorState.set(key, src); schedule(); });
    }
    return src;
  }
  const layerTotal = () => (hasBack(S.product) ? SIDES : ["front"]).reduce((n, side) => n + S.sides[side].filter((l) => !l.text || !isTextEmpty(l.text)).length, 0);
  const activeLayer = () => S.sides[S.side].find((l) => l.id === S.activeLayerId) ?? null;
  const quantityNumber = () => { const n = Number.parseInt(S.quantity.replace(/[,_\s]/g, ""), 10); return Number.isFinite(n) ? n : null; };
  const submitLabel = () => {
    if (S.mode !== "cart") return layerTotal() > 0 ? cfg.labels.submitWithDesign : cfg.labels.submit;
    return S.submitting ? cfg.labels.addingToCart : cfg.labels.addToCart;
  };

  // ---- commerce -----------------------------------------------------------------
  const sizeList = () => S.product.sizes ?? [];
  const variantFor = (size) => {
    const vs = S.product.shopify?.variants;
    if (!vs) return null;
    const colorId = S.colorSel.kind === "stocked" ? S.colorSel.color.id : null;
    return vs.find((v) => v.size === size && (colorId ? v.colorwayId === colorId : true)) ?? null;
  };
  function sizeRows() {
    return sizeList().map((size) => {
      const v = variantFor(size);
      const blank = cfg.pricing.blankSellPrices === true; return { size, quantity: Math.max(0, Math.trunc(S.sizes[size] ?? 0)), variantId: v?.id ?? null, unit: blank ? (v?.price ?? S.product.price ?? 0) : 0, available: v ? v.available : true };
    });
  }
  const sizeTotal = () => sizeRows().reduce((n, r) => n + r.quantity, 0);
  // In cart mode the size run is the source of truth; in quote mode it is the single number.
  const orderQty = () => (S.mode === "cart" && sizeList().length ? sizeTotal() : (quantityNumber() ?? 0));

  // Decoration is charged per print LOCATION, not per layer: two text layers on the same
  // chest are one print. Group by side + print area, union the ink colours, and measure the
  // combined artwork so the size band reflects what actually goes on the screen.
  function placementsForPricing() {
    const groups = new Map();
    for (const side of (hasBack(S.product) ? SIDES : ["front"])) {
      const layout = layoutFor(S.product, side);
      for (const l of S.sides[side]) {
        if (l.text && isTextEmpty(l.text)) continue;
        const area = resolvePlacementArea(layout.areas, l.placement);
        const key = `${side}:${area?.id ?? side}`;
        let g = groups.get(key);
        if (!g) { g = { id: key, side, label: placementAreaLabel(layout, l.placement) ?? SIDE_LABEL[side], left: 1, right: 0, inks: new Set(), imageColors: 0, fullColor: false }; groups.set(key, g); }
        const half = l.placement.width / 2;
        g.left = Math.min(g.left, l.placement.cx - half);
        g.right = Math.max(g.right, l.placement.cx + half);
        if (l.text) { g.inks.add(l.text.color.toLowerCase()); if (l.text.outline) g.inks.add(l.text.outline.toLowerCase()); }
        else {
          const n = inkColorsForLayer(l, analyses.get(l.artwork.url), cfg.pricing.assumedColors ?? 4);
          if (!Number.isFinite(n)) g.fullColor = true; else g.imageColors += n;
        }
      }
    }
    return [...groups.values()].map((g) => ({
      id: g.id, side: g.side, label: g.label,
      widthIn: Math.max(0, g.right - g.left) * STAGE_INCHES,
      colors: g.fullColor ? Infinity : Math.max(1, g.inks.size + g.imageColors),
    }));
  }
  function computePrice() {
    const rows = sizeRows();
    const useSizes = S.mode === "cart" && rows.length > 0;
    const allowBlank = cfg.pricing.blankSellPrices === true;
    return priceDesign({
      quantity: orderQty(),
      garment: allowBlank && useSizes ? rows.filter((r) => r.quantity > 0).map((r) => ({ label: r.size, qty: r.quantity, unit: r.unit })) : null,
      garmentUnitPrice: allowBlank ? (useSizes ? 0 : (S.product.price ?? 0)) : 0,
      method: S.method,
      placements: placementsForPricing(),
      customColor: S.colorSel.kind !== "stocked",
      garmentIsWhite: garmentIsWhiteFromSelection(S.colorSel),
      pricing: cfg.pricing,
    });
  }

  // ------------------------------------------------------------------ rendering
  // Pop-out mode wraps the studio in a full-screen overlay the host page opens on demand.
  const root = document.createElement("div"); root.className = "pc-shell";
  host.innerHTML = "";
  let overlay = null, lastFocus = null;
  if (cfg.modal) {
    host.classList.add("pc-host--modal");
    overlay = document.createElement("div");
    overlay.className = "pc-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", `Design ${initialProduct.name}`);
    const backdrop = document.createElement("div"); backdrop.className = "pc-overlay__backdrop"; backdrop.addEventListener("click", () => closeModal());
    const panel = document.createElement("div"); panel.className = "pc-overlay__panel";
    const close = document.createElement("button");
    close.type = "button"; close.className = "pc-overlay__close"; close.setAttribute("aria-label", "Close design studio");
    close.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    close.addEventListener("click", () => closeModal());
    panel.append(close, root);
    overlay.append(backdrop, panel);
    host.appendChild(overlay);
  } else {
    host.appendChild(root);
  }
  function openModal() {
    if (!overlay || S.open) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    S.open = true;
    document.documentElement.classList.add("pc-scroll-lock");
    requestAnimationFrame(() => { overlay.querySelector(".pc-overlay__close")?.focus({ preventScroll: true }); schedule(); });
  }
  function closeModal() {
    if (!overlay || !S.open) return;
    overlay.hidden = true;
    S.open = false;
    document.documentElement.classList.remove("pc-scroll-lock");
    lastFocus?.focus?.({ preventScroll: true });
    cfg.onClose?.(getDesign());
  }
  let rendered = false, frame = null;
  const stage = createStage({
    onSelect: (id) => { S.activeLayerId = id; S.tab = "design"; schedule(); },
    onDeselect: () => { S.activeLayerId = null; schedule(); },
    onPlacementChange: (id, fn) => updatePlacement(id, fn),
    onDelete: (id) => removeLayer(id),
    onFiles: (files) => files.forEach(acceptFile),
    onTextChange: (id, content) => { patchLayer(id, (l) => (l.text ? { ...l, text: { ...l.text, content } } : l)); scheduleTextRender(id); schedule(); },
    onTextCommit: (id) => { if (textTimer) { clearTimeout(textTimer); textTimer = null; } rerenderText(id, ++textToken); },
  });
  function schedule() { if (frame) return; frame = requestAnimationFrame(() => { frame = null; render(); }); }
  function view() {
    const product = S.product, layout = layoutFor(product, S.side);
    const layer = activeLayer();
    const sideList = hasBack(product) ? SIDES : ["front"];
    const mockup = { front: mockupFor("front"), back: hasBack(product) ? mockupFor("back") : null };
    const preflightReport = layer && !layer.text && S.preflight?.url === layer.artwork.url ? evaluatePreflight(S.preflight.analysis, { method: S.method, printedWidthIn: layer.placement.width * STAGE_INCHES, garmentHex: hex() }) : null;
    let contrastSuggestion = null;
    if (preflightReport?.flags.includes("low garment contrast") && S.preflight?.analysis.stats) {
      const st = S.preflight.analysis.stats;
      const c = suggestContrastingGarment(st.colors, st.meanInkLuma, stockedPicksForProduct(product).map((p) => ({ hex: p.color.hex, label: p.label, color: p.color })));
      if (c && c.hex.toLowerCase() !== hex().toLowerCase()) contrastSuggestion = c;
    }
    const price = computePrice();
    const rows = sizeRows();
    return { ...S, layout, activeLayer: layer, sideList, mockup, price, sizeRows: rows, sizeTotal: sizeTotal(), orderQty: orderQty(), money: (v) => formatMoney(v, cfg.pricing), mirrored: { front: false, back: false }, layerTotal: layerTotal(), quantityNumber: quantityNumber(), activeDesignIndex: Math.max(0, S.designs.findIndex((d) => d.id === S.activeDesignId)), preflightReport, contrastSuggestion, quality: layer ? estimateArtworkQuality(layer.artwork.naturalW, layer.placement.width, layer.artwork.isVector) : null };
  }
  function render() {
    const s = view();
    const stageHolder = h("div", { class: "pc-stage-holder", "data-keep": "" });
    const tree = h("div", { class: ["pc-shell", S.blanksCollapsed && "pc-shell--blanks-collapsed"] },
      renderDesignsRail(s, A),
      h("section", { class: "pc-center", id: "pc-preview-panel", "aria-label": "Design preview" },
        renderAlerts(s, A),
        h("div", { class: "pc-center__row" }, renderLayersRail(s, A), stageHolder, renderSideTabs(s, A))),
      renderBlanks(s, A),
      renderRightPanel(s, A),
      renderBottomBar(s, A),
      renderPreviewModal(s, A), renderResultModal(s, A), renderToasts(s, A));
    if (!rendered) { root.replaceWith(tree); rootRef = tree; rendered = true; }
    else morph(rootRef, tree);
    const holder = rootRef.querySelector(".pc-stage-holder");
    if (holder && stage.el.parentNode !== holder) holder.appendChild(stage.el);
    const areaLabel = s.layout.areas.find((ar) => ar.id === (s.activeLayer?.placement.area ?? S.side))?.label;
    const captioned = !!areaLabel && !/^(front|back)$/i.test(areaLabel.trim());
    stage.update({
      mockupSrc: s.mockup[S.side] ?? s.mockup.front, mockupAlt: s.product.name, mirrored: false, areas: s.layout.areas, side: S.side, category: s.product.category,
      layers: S.sides[S.side].map((l) => ({ id: l.id, url: l.artwork.url, naturalW: l.artwork.naturalW, naturalH: l.artwork.naturalH, placement: l.placement, text: l.text ? { content: l.text.content, color: l.text.color, fontFamily: fonts.canvasFamily(l.text.fontId), fontWeight: Number(fonts.weight(l.text.fontId)) } : undefined })),
      activeLayerId: S.activeLayerId, disabled: S.submitting, textMaxChars: TEXT_MAX_CHARS, preparing: S.preparing > 0,
      empty: { title: S.side === "back" ? "Drop your back graphic here" : `Drop your art on the ${s.product.category === "Bottoms" ? "garment" : s.product.category === "Headwear" || s.product.category === "Accessories" ? (s.layout.areas[0]?.label.toLowerCase() ?? "front panel") : "chest"}` },
      caption: captioned ? `${{ screen: "Screen print", embroidery: "Embroidery", dtg: "DTG", dtf: "DTF" }[S.method] ?? S.method} preview · ${areaLabel}` : null,
    });
    cfg.onChange?.(getDesign());
    scheduleDraft();
  }
  let rootRef = root;

  // ------------------------------------------------------------------ layer mutations
  function patchLayer(id, fn) { for (const side of SIDES) if (S.sides[side].some((l) => l.id === id)) S.sides[side] = S.sides[side].map((l) => (l.id === id ? fn(l) : l)); }
  const sideOf = (id) => SIDES.find((side) => S.sides[side].some((l) => l.id === id)) ?? S.side;
  function updatePlacement(id, fn) {
    patchLayer(id, (l) => { const aspect = l.artwork.naturalW > 0 && l.artwork.naturalH > 0 ? l.artwork.naturalH / l.artwork.naturalW : 1; return { ...l, placement: constrainPlacementToAreas(fn(l.placement), layoutFor(S.product, sideOf(id)).areas, aspect) }; });
    schedule();
  }
  function addLayer(artwork, opts = {}) {
    const side = opts.side ?? S.side, id = newId("layer");
    objectUrls.add(artwork.url);
    const aspect = artwork.naturalW > 0 && artwork.naturalH > 0 ? artwork.naturalH / artwork.naturalW : 1;
    const layout = layoutFor(S.product, side);
    const layer = { id, artwork, placement: constrainPlacementToAreas(opts.placement ?? defaultPlacementForLayout(layout), layout.areas, aspect), text: opts.text };
    S.sides[side] = [...S.sides[side], layer];
    if (opts.select !== false) { S.side = side; S.activeLayerId = id; S.tab = "design"; }
    if (!opts.text) analyzeArtwork(artwork).then((a) => { analyses.set(artwork.url, a); schedule(); }).catch(() => {});
    if (opts.persisted !== undefined) mirrors.set(id, opts.persisted);
    else fileToDraftArtwork(artwork.file).then((d) => { mirrors.set(id, d); if (d === null) { S.largeArtNotice = true; schedule(); } });
    schedule();
    return id;
  }
  function removeLayer(id) {
    const side = sideOf(id), layer = S.sides[side].find((l) => l.id === id);
    if (!layer) return;
    clearLayerUndo();
    S.undo.layer = { layer, side, mirror: mirrors.get(id) ?? null }; mirrors.delete(id);
    S.sides[side] = S.sides[side].filter((l) => l.id !== id);
    if (S.activeLayerId === id) S.activeLayerId = S.sides[side][S.sides[side].length - 1]?.id ?? null;
    undoLayerTimer = setTimeout(clearLayerUndo, 6000);
    schedule();
  }
  function clearLayerUndo() { const u = S.undo.layer; if (u) { URL.revokeObjectURL(u.layer.artwork.url); objectUrls.delete(u.layer.artwork.url); S.undo.layer = null; } if (undoLayerTimer) { clearTimeout(undoLayerTimer); undoLayerTimer = null; } }
  function undoRemoveLayer() { const u = S.undo.layer; if (!u) return; if (undoLayerTimer) clearTimeout(undoLayerTimer); undoLayerTimer = null; S.undo.layer = null; mirrors.set(u.layer.id, u.mirror); S.sides[u.side] = [...S.sides[u.side], u.layer]; S.side = u.side; S.activeLayerId = u.layer.id; schedule(); }
  function duplicateLayer(id) {
    const side = sideOf(id), l = S.sides[side].find((x) => x.id === id); if (!l) return;
    const art = { ...l.artwork, url: URL.createObjectURL(l.artwork.file) };
    addLayer(art, { side, placement: { ...l.placement, cx: clamp(l.placement.cx + 0.035, 0.05, 0.95), cy: clamp(l.placement.cy + 0.035, 0.05, 0.95) }, text: l.text ? { ...l.text } : undefined });
    emit("duplicate", { kind: l.text ? "text" : "image" });
  }
  function reorderLayer(delta) {
    const id = S.activeLayerId; if (!id) return;
    const side = sideOf(id), arr = S.sides[side].slice(), i = arr.findIndex((l) => l.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; S.sides[side] = arr; schedule();
  }

  // ------------------------------------------------------------------ files & text
  S.preparing = 0;
  function acceptFile(file) {
    if (!isAcceptedArtwork(file.name)) { S.error = "That file type won't preview here. Use a PNG, JPG, WebP, SVG, or PDF/AI file."; schedule(); return; }
    if (file.size > MAX_ARTWORK_BYTES) { S.error = `Artwork is too large (max ${Math.floor(MAX_ARTWORK_BYTES / 1048576)} MB). Export a smaller PNG and re-upload.`; schedule(); return; }
    S.error = null;
    const convert = isConvertibleArtwork(file.name);
    if (convert) { S.preparing++; schedule(); }
    const gen = generation;
    probeAnyArtworkFile(file, cfg).then((art) => { if (gen !== generation) return; addLayer(art); emit("upload", { type: convert ? "print-file" : file.type || "unknown" }); })
      .catch((e) => { S.error = e instanceof PrintFileError && e.message ? e.message : "We couldn't read that image. Try a different file."; })
      .finally(() => { if (convert) S.preparing--; schedule(); });
  }
  function inkForGarment() { return relativeLuminance(hex()) < 0.45 ? "#FFFFFF" : "#111111"; }
  async function addText() {
    const text = { content: "", fontId: fonts.defaultId(), color: inkForGarment() };
    const base = defaultPlacementForLayout(layoutFor(S.product, S.side));
    const placement = { ...base, width: clamp(1.25 * base.width, 0.04, 0.5) };
    try {
      const art = await renderTextLayer(text, fonts);
      const id = addLayer(art, { side: S.side, placement, text });
      requestAnimationFrame(() => requestAnimationFrame(() => stage.startTextEdit(id)));
      emit("text_add", { font: text.fontId });
    } catch { S.error = "Couldn't add text. Try again in a moment."; schedule(); }
  }
  async function applyStarter(starter) {
    const color = inkForGarment(), specs = starter.layers.map((l) => ({ ...l.text, color }));
    try {
      const arts = await Promise.all(specs.map((sp) => renderTextLayer(sp, fonts)));
      arts.forEach((art, i) => { const l = starter.layers[i]; addLayer(art, { side: S.side, placement: { cx: l.cx, cy: l.cy, width: l.width, rotation: 0, flipX: false }, text: specs[i], select: i === 0 }); });
      emit("starter", { starter: starter.id });
    } catch { S.error = "Couldn't load that starter. Try again in a moment."; schedule(); }
  }
  async function addSampleLogo() {
    if (!cfg.sampleLogo) return;
    try {
      const blob = await (await fetch(cfg.sampleLogo)).blob();
      const art = await probeArtworkFile(new File([blob], "sample-logo.png", { type: blob.type || "image/png" }));
      const spots = layoutFor(S.product, S.side).spots, sp = spots.find((s) => s.id === "center-chest") ?? spots[0];
      addLayer(art, { placement: sp ? { cx: sp.cx, cy: sp.cy, width: sp.width, rotation: 0, flipX: false, area: sp.areaId } : undefined });
    } catch { S.error = "Couldn't load that sample. Try uploading your own art."; schedule(); }
  }
  function scheduleTextRender(id) { if (textTimer) clearTimeout(textTimer); const token = ++textToken; textTimer = setTimeout(() => rerenderText(id, token), 160); }
  async function rerenderText(id, token) {
    const l = SIDES.flatMap((s) => S.sides[s]).find((x) => x.id === id);
    if (!l?.text) return;
    try {
      const art = await renderTextLayer(l.text, fonts);
      const cur = SIDES.flatMap((s) => S.sides[s]).find((x) => x.id === id);
      if (token !== textToken || !cur) { URL.revokeObjectURL(art.url); return; }
      const old = cur.artwork.url; objectUrls.add(art.url);
      const oldAspect = cur.artwork.naturalW > 0 ? cur.artwork.naturalH / cur.artwork.naturalW : 1, newAspect = art.naturalW > 0 ? art.naturalH / art.naturalW : 1;
      patchLayer(id, (x) => ({ ...x, artwork: art, placement: { ...x.placement, width: clamp(x.placement.width * (oldAspect / newAspect), 0.04, 0.92) } }));
      fileToDraftArtwork(art.file).then((d) => mirrors.set(id, d));
      setTimeout(() => { URL.revokeObjectURL(old); objectUrls.delete(old); }, 1500);
      schedule();
    } catch { /* keep previous raster */ }
  }
  function setText(id, patch) { patchLayer(id, (l) => (l.text ? { ...l, text: { ...l.text, ...patch } } : l)); scheduleTextRender(id); schedule(); }
  // Re-rasterise every non-empty text layer (used before export so the PNGs match the final spec).
  async function flushText() {
    if (textTimer) { clearTimeout(textTimer); textTimer = null; } textToken++;
    for (const side of SIDES) {
      S.sides[side] = await Promise.all(S.sides[side].map(async (l) => {
        if (!l.text || isTextEmpty(l.text)) return l;
        const art = await renderTextLayer(l.text, fonts); const old = l.artwork.url; objectUrls.add(art.url);
        fileToDraftArtwork(art.file).then((d) => mirrors.set(l.id, d));
        setTimeout(() => { URL.revokeObjectURL(old); objectUrls.delete(old); }, 1500);
        return { ...l, artwork: art };
      }));
    }
    schedule();
  }
  async function uploadFont(file, layerId) {
    try { const f = await fonts.addFile(file); if (layerId) setText(layerId, { fontId: f.id }); emit("font_upload", { name: file.name }); }
    catch (e) { S.error = e?.message ?? "Couldn't load that font."; }
    schedule();
  }

  // ------------------------------------------------------------------ product / colour
  function selectProduct(id) {
    const next = findProduct(id); if (!next || next.id === S.productId) return;
    for (const side of SIDES) {
      const from = layoutFor(S.product, side), to = layoutFor(next, side);
      S.sides[side] = S.sides[side].map((l) => { const aspect = l.artwork.naturalW > 0 ? l.artwork.naturalH / l.artwork.naturalW : 1; return { ...l, placement: remapPlacementBetweenLayouts(l.placement, from, to, aspect) }; });
    }
    S.productId = next.id; S.product = next;
    if (S.colorSel.kind === "stocked" && !stockedPicksForProduct(next).some((p) => p.color.id === S.colorSel.color.id)) S.colorSel = deserializeSelection(serializeSelection(S.colorSel), next) ?? defaultStockedSelection(next);
    if (S.side === "back" && !hasBack(next)) { S.side = "front"; S.activeLayerId = null; }
    prewarm(next);
    try { history.replaceState(null, "", `?style=${encodeURIComponent(next.id)}`); } catch { /* ignore */ }
    emit("style", { style: next.styleNumber });
    schedule();
  }
  function prewarm(p) { if (p.recolorMode !== "cap") { prewarmGarment(photoUrl(p.photos.front), p.photos.frontMask ? photoUrl(p.photos.frontMask) : undefined); if (p.photos.back) prewarmGarment(photoUrl(p.photos.back)); } }
  function setColor(sel) { S.colorSel = sel; S.colorUi.hsv = null; S.colorUi.hexDraft = null; schedule(); }
  function setCustomHex(v, remember) { const n = normalizeHex(v); if (!n) return; S.colorSel = { kind: "custom", hex: n }; S.colorUi.hsv = hexToHsv(n); if (remember) pushRecent(n); schedule(); }
  function pushRecent(n) { S.colorUi.recent = [n, ...S.colorUi.recent.filter((r) => r !== n)].slice(0, 8); }
  function thumbSrc(p) { const colorway = p.colors.find((c) => /pfd|white/i.test(c.id))?.id ?? p.colors[0]?.id; return photoUrl(p.colorwayImages?.[colorway] ?? p.photos.front); }

  // ------------------------------------------------------------------ designs rail
  const design = () => S.designs.find((d) => d.id === S.activeDesignId) ?? S.designs[0];
  const serializeLayers = (layers) => layers.map((l) => ({ placement: l.placement, artwork: mirrors.get(l.id) ?? null, text: l.text ?? null }));
  function serializeDesign(d, isActive) {
    if (isActive) return { styleId: S.productId, pantone: serializeSelection(S.colorSel), sides: { front: serializeLayers(S.sides.front), back: serializeLayers(S.sides.back) } };
    if (d.pending) return d.pending;
    return { styleId: d.productId, pantone: serializeSelection(d.colorSel), sides: d.stash ? { front: serializeLayers(d.stash.front), back: serializeLayers(d.stash.back) } : { front: [], back: [] } };
  }
  function stashActive() { const d = design(); d.productId = S.productId; d.colorSel = S.colorSel; d.stash = { front: S.sides.front, back: S.sides.back }; d.pending = null; }
  function loadDesignSlot(d) {
    const gen = ++generation;
    const p = findProduct(d.productId) ?? S.product;
    S.productId = p.id; S.product = p; S.colorSel = d.colorSel;
    S.side = S.side === "back" && hasBack(p) ? "back" : "front";
    if (d.stash) { S.sides = { front: d.stash.front, back: d.stash.back }; S.activeLayerId = S.sides[S.side][S.sides[S.side].length - 1]?.id ?? null; }
    else { S.sides = { front: [], back: [] }; S.activeLayerId = null; if (d.pending) { const pend = d.pending; d.pending = null; restoreSides(pend.sides, gen); } }
    prewarm(p);
  }
  function switchDesign(id) {
    if (id === S.activeDesignId) return;
    const target = S.designs.find((d) => d.id === id); if (!target) return;
    clearLayerUndo(); clearDesignUndo(); stashActive();
    S.activeDesignId = id; loadDesignSlot(target); emit("design", { action: "switch", designs: S.designs.length }); schedule();
  }
  function newDesign() {
    if (S.designs.length >= DESIGN_RAIL_MAX) return;
    clearLayerUndo(); clearDesignUndo(); stashActive(); ++generation;
    const d = { id: newId("design"), productId: S.productId, colorSel: S.colorSel, stash: null, pending: null };
    S.designs.push(d); S.activeDesignId = d.id; S.sides = { front: [], back: [] }; S.activeLayerId = null; S.side = "front";
    emit("design", { action: "new", designs: S.designs.length }); schedule();
  }
  function duplicateDesign() {
    if (S.designs.length >= DESIGN_RAIL_MAX) return;
    clearLayerUndo(); clearDesignUndo(); ++generation;
    const clone = (layers) => layers.map((l) => { const id = newId("layer"), url = URL.createObjectURL(l.artwork.file); objectUrls.add(url); mirrors.set(id, mirrors.get(l.id) ?? null); return { ...l, id, artwork: { ...l.artwork, url }, text: l.text ? { ...l.text } : undefined }; });
    const copy = { front: clone(S.sides.front), back: clone(S.sides.back) };
    stashActive();
    const cur = S.designs.findIndex((d) => d.id === S.activeDesignId);
    const d = { id: newId("design"), productId: S.productId, colorSel: S.colorSel, stash: null, pending: null };
    S.designs.splice(cur + 1, 0, d); S.activeDesignId = d.id; S.sides = copy; S.activeLayerId = S.sides[S.side][S.sides[S.side].length - 1]?.id ?? null;
    emit("design", { action: "duplicate", designs: S.designs.length }); schedule();
  }
  function removeDesign(id) {
    if (S.designs.length <= 1) return;
    const i = S.designs.findIndex((d) => d.id === id); if (i < 0) return;
    clearLayerUndo(); clearDesignUndo();
    const wasActive = id === S.activeDesignId;
    if (wasActive) stashActive();
    S.undo.design = { slot: S.designs[i], index: i };
    S.designs = S.designs.filter((d) => d.id !== id);
    if (wasActive) { const next = S.designs[i] ?? S.designs[i - 1]; S.activeDesignId = next.id; loadDesignSlot(next); }
    undoDesignTimer = setTimeout(clearDesignUndo, 6000);
    emit("design", { action: "remove", designs: S.designs.length }); schedule();
  }
  function clearDesignUndo() { const u = S.undo.design; if (u) { for (const side of SIDES) for (const l of u.slot.stash?.[side] ?? []) { URL.revokeObjectURL(l.artwork.url); objectUrls.delete(l.artwork.url); mirrors.delete(l.id); } S.undo.design = null; } if (undoDesignTimer) { clearTimeout(undoDesignTimer); undoDesignTimer = null; } }
  function undoRemoveDesign() { const u = S.undo.design; if (!u) return; if (undoDesignTimer) clearTimeout(undoDesignTimer); undoDesignTimer = null; S.undo.design = null; if (!S.designs.some((d) => d.id === u.slot.id)) S.designs.splice(Math.min(u.index, S.designs.length), 0, u.slot); schedule(); }

  // ------------------------------------------------------------------ drafts / restore
  function restoreSides(sides, gen) {
    const get = (side) => (Array.isArray(sides?.[side]) ? sides[side] : []);
    const last = get("front").length - 1;
    for (const side of SIDES) get(side).forEach((raw, i) => {
      if (!raw || typeof raw !== "object") return;
      const select = side === "front" && i === last;
      const text = raw.text ? sanitizeTextSpec(raw.text, fonts) : null;
      if (text) renderTextLayer(text, fonts).then((art) => { if (gen === generation) addLayer(art, { side, placement: sanitizePlacement(raw.placement) ?? undefined, text, select }); }).catch(() => {});
      else if (raw.artwork && typeof raw.artwork.dataUrl === "string") {
        const blob = dataUrlToBlob(raw.artwork.dataUrl); if (!blob) return;
        probeAnyArtworkFile(new File([blob], raw.artwork.name || "artwork", { type: raw.artwork.type || blob.type }), cfg).then((art) => { if (gen === generation) addLayer(art, { side, placement: sanitizePlacement(raw.placement) ?? undefined, persisted: raw.artwork, select }); }).catch(() => {});
      }
    });
  }
  let draftTimer = null;
  function scheduleDraft() {
    if (!cfg.persistDraft || handedOff) return;
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const designs = S.designs.map((d) => serializeDesign(d, d.id === S.activeDesignId));
      const idx = Math.max(0, S.designs.findIndex((d) => d.id === S.activeDesignId));
      writeDraft(cfg.draftKey, { styleId: S.productId, pantone: serializeSelection(S.colorSel), method: S.method, quantity: S.quantity, notes: S.notes, email: S.email, sides: designs[idx]?.sides, designs, activeDesign: idx, colorUi: { recent: S.colorUi.recent } });
    }, 400);
  }
  function restoreDraft() {
    const shared = location.hash.match(/#pc=([A-Za-z0-9_-]+)/);
    if (shared) { const d = decodeShare(shared[1]); if (d) { loadSharedDesign(d); return; } }
    const draft = readDraft(cfg.draftKey);
    if (!draft) return;
    const p = !cfg.initialProductId && draft.styleId ? findProduct(draft.styleId) : null;
    if (p) { S.productId = p.id; S.product = p; }
    const sel = deserializeSelection(draft.pantone, S.product); if (sel) S.colorSel = sel;
    if (draft.method && (cfg.pricing.methods[draft.method] || ["screen", "embroidery", "dtg", "dtf"].includes(draft.method))) S.method = draft.method;
    if (typeof draft.quantity === "string") S.quantity = draft.quantity;
    if (typeof draft.notes === "string") S.notes = draft.notes;
    if (typeof draft.email === "string") S.email = draft.email;
    if (Array.isArray(draft.colorUi?.recent)) S.colorUi.recent = draft.colorUi.recent.filter((x) => normalizeHex(x)).slice(0, 8);
    const list = Array.isArray(draft.designs) ? draft.designs.filter((d) => d && typeof d === "object").slice(0, DESIGN_RAIL_MAX) : [];
    if (list.length === 0) { if (draft.sides) restoreSides(draft.sides, generation); return; }
    const active = clamp(Math.trunc(draft.activeDesign ?? 0), 0, list.length - 1);
    S.designs = list.map((d) => { const prod = findProduct(d.styleId) ?? products[0]; return { id: newId("design"), productId: prod.id, colorSel: deserializeSelection(d.pantone, prod) ?? defaultStockedSelection(prod), stash: null, pending: d }; });
    const slot = S.designs[active]; S.activeDesignId = slot.id;
    const prod = findProduct(slot.productId) ?? products[0]; S.productId = prod.id; S.product = prod; S.colorSel = slot.colorSel;
    const pend = slot.pending; slot.pending = null; restoreSides(pend?.sides, generation);
  }
  function loadSharedDesign(d) {
    const p = findProduct(d.styleId); if (p) { S.productId = p.id; S.product = p; }
    const sel = deserializeSelection(d.pantone, S.product); if (sel) S.colorSel = sel;
    if (d.method && (cfg.pricing.methods[d.method] || ["screen", "embroidery", "dtg", "dtf"].includes(d.method))) S.method = d.method;
    restoreSides(d.sides, generation);
    if (d.omittedImages) S.notice = "This shared link contains the text layers. Uploaded images can't travel in a link, so re-upload them if needed.";
  }

  // ------------------------------------------------------------------ export / share / submit
  const sidesForExport = () => (hasBack(S.product) ? SIDES : ["front"]).map((side) => { const layout = layoutFor(S.product, side); return { side, label: SIDE_LABEL[side], mockupSrc: mockupFor(side), mirrored: false, layers: S.sides[side].filter((l) => !l.text || !isTextEmpty(l.text)).map((l) => ({ artwork: l.artwork, placement: l.placement, clipRect: resolvePlacementArea(layout.areas, l.placement)?.rect })) }; });
  async function waitForMockups() {
    // Recolour jobs resolve asynchronously; give them a moment so exports use the coloured photo.
    for (let i = 0; i < 40; i++) { const pendingJobs = [...recolorState.values()].some((v) => v === null); if (!pendingJobs) break; await new Promise((r) => setTimeout(r, 100)); }
  }
  async function openPreview() {
    S.preview = { open: true, busy: true, images: [], failed: false }; schedule();
    try {
      await flushText(); await waitForMockups();
      const images = [];
      for (const s of sidesForExport()) { if (s.layers.length === 0) continue; const blob = await composeMockupPng(s.mockupSrc, s.layers, { mirrored: s.mirrored }); if (blob) images.push({ label: s.label, url: URL.createObjectURL(blob) }); }
      S.preview = { open: true, busy: false, images, failed: false };
    } catch { S.preview = { open: true, busy: false, images: [], failed: true }; }
    schedule();
  }
  function closePreview() { S.preview.images.forEach((i) => URL.revokeObjectURL(i.url)); S.preview = { open: false, busy: false, images: [], failed: false }; schedule(); }
  async function renderFinal() { await flushText(); await waitForMockups(); return composeFinalPreviewPng(sidesForExport()); }
  async function download(source) {
    if (S.saving) return; S.saving = true; schedule();
    try {
      const blob = await renderFinal();
      if (!blob) { S.error = "Couldn't render the design image to save. Try again in a moment."; return; }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `${S.product.styleNumber.toLowerCase()}-mockup.png`; a.click(); URL.revokeObjectURL(url);
      emit("save", { style: S.product.styleNumber, source, designs: layerTotal() });
    } catch { S.error = "Couldn't render the design image to save. Try again in a moment."; }
    finally { S.saving = false; schedule(); }
  }
  async function share() {
    if (S.share === "working") return;
    S.share = "working"; S.shareExpires = null; S.shareLink = null; schedule();
    const fail = () => { S.share = "failed"; setTimeout(() => { S.share = "idle"; schedule(); }, 3000); schedule(); };
    try {
      const d = serializeDesign(design(), true);
      let url;
      if (cfg.onShare) {
        const blob = await renderFinal();
        const preview = blob ? await blobToPreviewDataUrl(blob) : null;
        const res = await cfg.onShare({ design: { ...d, styleName: S.product.name, styleNumber: S.product.styleNumber, method: S.method }, previews: preview ? [preview] : [] });
        if (!res?.url) return fail();
        url = res.url;
        if (res.expiresAt) { const t = Date.parse(res.expiresAt); S.shareExpires = Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : true; } else S.shareExpires = true;
      } else {
        // Default: text layers + placements travel in the URL fragment (images can't).
        const strip = (layers) => layers.filter((l) => l.text && l.text.content.trim()).map((l) => ({ placement: l.placement, text: l.text }));
        const omitted = d.sides.front.some((l) => !l.text) || d.sides.back.some((l) => !l.text);
        const payload = { styleId: d.styleId, pantone: d.pantone, method: S.method, sides: { front: strip(d.sides.front), back: strip(d.sides.back) }, omittedImages: omitted };
        url = `${location.origin}${location.pathname}?style=${encodeURIComponent(S.productId)}#pc=${encodeShare(payload)}`;
        S.shareExpires = true;
      }
      S.shareLink = null;
      try { await navigator.clipboard.writeText(url); } catch { S.shareLink = url; }
      S.share = "copied"; setTimeout(() => { S.share = "idle"; schedule(); }, 2500);
      emit("share", { style: S.product.styleNumber });
    } catch { return fail(); }
    schedule();
  }
  async function submit() {
    if (S.submitting) return;
    const price = computePrice();
    const qty = price.quantity;
    if (qty < 1) { S.error = S.mode === "cart" && sizeList().length ? "Choose how many of each size you need." : "Enter how many pieces you need."; S.tab = "quote"; schedule(); return; }
    const blocker = price.blockers[0];
    if (S.mode === "cart" && blocker) { S.error = blocker.text; S.tab = "quote"; schedule(); return; }
    S.error = null; S.submitting = true; schedule();
    try {
      await flushText(); await waitForMockups();
      const layers = (hasBack(S.product) ? SIDES : ["front"]).flatMap((side) => S.sides[side].filter((l) => !l.text || !isTextEmpty(l.text)).map((l) => ({ layer: l, side })));
      const layout = Object.fromEntries(SIDES.map((s) => [s, layoutFor(S.product, s)]));
      const lines = layers.map(({ layer, side }, i) => {
        const area = placementAreaLabel(layout[side], layer.placement), generic = area === SIDE_LABEL[side];
        let line = `${i + 1}. ${SIDE_LABEL[side]} placement${area && !generic ? ` · ${area.toLowerCase()}` : ""}`;
        if (layer.text) { const f = fonts.get(layer.text.fontId), bits = [f.name, `ink ${layer.text.color}`]; if (layer.text.outline) bits.push(`outline ${layer.text.outline}`); if (layer.text.arc) bits.push(`curve ${Math.round(100 * layer.text.arc)}%`); if (layer.text.spacing) bits.push(`tracking ${Math.round(100 * layer.text.spacing)}%`); line += ` · text: "${layer.text.content.trim().replace(/\s+/g, " ").slice(0, 80)}" (${bits.join(", ")})`; }
        return line;
      });
      const others = S.designs.filter((d) => d.id !== S.activeDesignId).map((d, i) => { const p = findProduct(d.productId); const n = d.pending ? ["front", "back"].reduce((k, s) => k + (d.pending.sides?.[s]?.length ?? 0), 0) : d.stash ? d.stash.front.length + d.stash.back.length : 0; return `${i + 1}. ${p?.name ?? d.productId} · ${selectionNotesLabel(d.colorSel)} · ${n} placement${n === 1 ? "" : "s"}`; });
      const notes = [S.notes.trim(), `Garment color: ${selectionNotesLabel(S.colorSel)}`, layers.length > 0 ? `Placements (${layers.length}):\n${lines.join("\n")}` : "Artwork: not supplied yet. Quote the selected colored blank; the customer will send artwork later.", others.length ? `Other designs saved in the studio (artwork not attached to this request):\n${others.join("\n")}` : ""].filter(Boolean).join("\n");
      const usedFonts = [...new Set(layers.filter((x) => x.layer.text).map((x) => x.layer.text.fontId))].map((id) => fonts.exportUploaded(id)).filter(Boolean);
      const mockups = [];
      for (const s of sidesForExport()) { if (s.layers.length === 0) continue; const blob = await composeMockupPng(s.mockupSrc, s.layers, { mirrored: s.mirrored }); if (blob) mockups.push({ side: s.side, label: s.label, blob, file: new File([blob], `${S.product.styleNumber.toLowerCase()}-${s.side}.png`, { type: "image/png" }) }); }
      const final = await composeFinalPreviewPng(sidesForExport());
      const payload = {
        product: { id: S.product.id, name: S.product.name, styleNumber: S.product.styleNumber, category: S.product.category },
        color: { selection: serializeSelection(S.colorSel), hex: hex(), name: selectionName(S.colorSel), label: selectionNotesLabel(S.colorSel) },
        method: S.method, quantity: qty, notes, email: S.email.trim(),
        layers: layers.map(({ layer, side }) => {
          // Preflight is computed for the customer on screen but was never persisted; production
          // needs the same verdict (DPI at printed size, ink count, flags) attached to the order.
          const analysis = layer.text ? null : analyses.get(layer.artwork.url);
          const preflight = analysis ? evaluatePreflight(analysis, { method: S.method, printedWidthIn: layer.placement.width * STAGE_INCHES, garmentHex: hex() }) : null;
          return { side, placement: layer.placement, areaLabel: placementAreaLabel(layout[side], layer.placement), text: layer.text ?? null, file: layer.artwork.file, fileName: layer.artwork.file.name, isVector: layer.artwork.isVector, naturalW: layer.artwork.naturalW, naturalH: layer.artwork.naturalH, printedWidthIn: layer.placement.width * STAGE_INCHES, preflight };
        }),
        fonts: usedFonts, mockups, finalPreview: final, design: serializeDesign(design(), true),
        price, sizes: sizeRows().filter((r) => r.quantity > 0), priceMethodLabel: cfg.pricing.methods[S.method]?.label ?? S.method,
        otherDesigns: S.designs.filter((d) => d.id !== S.activeDesignId).map((d) => serializeDesign(d, false)),
      };
      emit("submit", { style: S.product.styleNumber, qty, designs: layers.length });
      if (cfg.onSubmit) {
        handedOff = true;
        try { await cfg.onSubmit(payload, api); } catch (err) { handedOff = false; throw err; }
        handedOff = false;
      }
      else {
        const previewUrl = final ? URL.createObjectURL(final) : null;
        S.result = { title: "Request prepared", message: "No onSubmit handler is configured, so here is the payload your site would receive. Wire config.onSubmit to send it to your cart, checkout or quote form.", previewUrl, details: JSON.stringify({ ...payload, layers: payload.layers.map((l) => ({ ...l, file: `[File ${l.fileName}]` })), mockups: payload.mockups.map((m) => `[PNG ${m.label}]`), finalPreview: final ? "[PNG]" : null, fonts: payload.fonts.map((f) => f.name), design: undefined, otherDesigns: undefined, notes: undefined }, null, 2) + `\n\nNotes:\n${notes}` };
      }
    } catch (e) {
      S.error = e?.message || (S.mode === "cart" ? "We couldn't add this to your cart. Please try again." : "Something went wrong preparing your design. Try again, or request a quote and attach your artwork there.");
    } finally { S.submitting = false; schedule(); }
  }

  // ------------------------------------------------------------------ public API
  function getDesign() { return { productId: S.productId, product: S.product, color: serializeSelection(S.colorSel), method: S.method, quantity: S.quantity, notes: S.notes, sides: { front: S.sides.front.map((l) => ({ id: l.id, placement: l.placement, text: l.text ?? null, fileName: l.artwork.file.name })), back: S.sides.back.map((l) => ({ id: l.id, placement: l.placement, text: l.text ?? null, fileName: l.artwork.file.name })) } }; }
  const api = {
    getDesign, getState: () => S,
    setProduct: selectProduct, setColor: (hint) => { const sel = typeof hint === "string" ? resolveColorHint(hint, S.product) : hint; if (sel) setColor(sel); },
    addFiles: (files) => files.forEach(acceptFile), addText, applyStarter,
    setMethod: (m) => { S.method = m; schedule(); }, setQuantity: (q) => { S.quantity = String(q); schedule(); },
    openPreview, download, share, submit, fonts,
    open: openModal, close: closeModal, isOpen: () => S.open,
    setSizes: (map) => { S.sizes = { ...map }; schedule(); },
    getPrice: () => computePrice(),
    loadDesign: (d) => { ++generation; S.sides = { front: [], back: [] }; S.activeLayerId = null; loadSharedDesign(d); schedule(); },
    destroy() { for (const u of objectUrls) URL.revokeObjectURL(u); document.removeEventListener("keydown", onKey); host.innerHTML = ""; },
  };
  const A = {
    selectProduct, thumbSrc, setColor, setColorMode: (m) => { S.colorUi.mode = m; if (m === "custom") { S.colorUi.hsv = hexToHsv(hex()); if (S.colorSel.kind !== "custom") S.colorSel = S.colorSel.kind === "pantone" ? S.colorSel : { kind: "custom", hex: hex() }; } schedule(); },
    setColorUi: (patch) => { Object.assign(S.colorUi, patch); schedule(); },
    setHsv: (hsv) => { S.colorUi.hsv = hsv; S.colorUi.hexDraft = null; S.colorSel = { kind: "custom", hex: hsvToHex(hsv) }; schedule(); },
    pickSV: (e) => { const r = e.currentTarget.getBoundingClientRect(); const hsv = S.colorUi.hsv ?? hexToHsv(hex()); A.setHsv({ ...hsv, s: Math.round(100 * clamp((e.clientX - r.left) / r.width, 0, 1)), v: Math.round((1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * 100) }); },
    setHexDraft: (v) => { const t = v.replace(/[^0-9a-fA-F]/g, "").slice(0, 6); S.colorUi.hexDraft = t; if (normalizeHex(t)) { S.colorSel = { kind: "custom", hex: normalizeHex(t) }; S.colorUi.hsv = hexToHsv(normalizeHex(t)); } schedule(); },
    commitCustomHex: () => { S.colorUi.hexDraft = null; if (S.colorSel.kind === "custom") pushRecent(S.colorSel.hex); schedule(); },
    setCustomHex, setPantoneCode: (v) => { S.colorUi.code = v; const c = findPantoneByCode(v); if (c) { S.colorSel = { kind: "pantone", color: c }; S.colorUi.hsv = hexToHsv(c.hex); } schedule(); },
    eyeDrop: async () => { try { const { sRGBHex } = await new window.EyeDropper().open(); setCustomHex(sRGBHex, true); } catch { /* cancelled */ } },
    setTab: (t) => { S.tab = t; schedule(); }, toggleBlanks: (v) => { S.blanksCollapsed = v ?? !S.blanksCollapsed; schedule(); },
    jumpTo: (t) => { if (t === "blank") { if (S.blanksCollapsed) { S.blanksCollapsed = false; schedule(); } rootRef.querySelector("#pc-section-blank")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; } S.tab = t; schedule(); rootRef.querySelector(".pc-panel--right")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); },
    setBlanksQuery: (q) => { S.blanksQuery = q; schedule(); }, setBlanksCategory: (c) => { S.blanksCategory = c; schedule(); }, expandBlanks: () => { S.blanksExpanded = true; schedule(); },
    setSide: (side) => { S.side = side; S.activeLayerId = S.sides[side][S.sides[side].length - 1]?.id ?? null; schedule(); },
    selectLayer: (id) => { S.activeLayerId = id; S.tab = "design"; schedule(); }, deselect: () => { S.activeLayerId = null; schedule(); },
    updateActivePlacement: (fn) => { if (S.activeLayerId) updatePlacement(S.activeLayerId, fn); },
    resetPlacement: () => { if (S.activeLayerId) updatePlacement(S.activeLayerId, () => defaultPlacementForLayout(layoutFor(S.product, S.side))); },
    applySpot: (sp) => { if (S.activeLayerId) updatePlacement(S.activeLayerId, (p) => ({ ...p, cx: sp.cx, cy: sp.cy, width: sp.width, area: sp.areaId })); },
    duplicateLayer, removeLayer, undoRemoveLayer, reorderLayer,
    addText, applyStarter, addSampleLogo, openFilePicker: () => stage.openFilePicker({ multiple: true }),
    setText, uploadFont, removeFont: async (id) => { await fonts.remove(id); for (const side of SIDES) S.sides[side].forEach((l) => { if (l.text?.fontId === id) setText(l.id, { fontId: fonts.defaultId() }); }); schedule(); }, setFontManager: (v) => { S.fontManager = v; schedule(); },
    setPreflightOpen: (v) => { S.preflightOpen = v; schedule(); },
    setMethod: (m) => { S.method = m; schedule(); }, setQuantity: (q) => { S.quantity = q; schedule(); }, setNotes: (n) => { S.notes = n; schedule(); }, setEmail: (e) => { S.email = e; schedule(); },
    setSize: (size, qty) => { const n = Math.max(0, Math.trunc(Number(qty) || 0)); if (n === 0) delete S.sizes[size]; else S.sizes[size] = n; schedule(); },
    bumpSize: (size, delta) => { const n = Math.max(0, (S.sizes[size] ?? 0) + delta); if (n === 0) delete S.sizes[size]; else S.sizes[size] = n; schedule(); },
    clearSizes: () => { S.sizes = {}; schedule(); },
    spreadSizes: (total) => { const list = sizeRows().filter((r) => r.available).map((r) => r.size); if (!list.length) return; const each = Math.floor(total / list.length); let rest = total - each * list.length; S.sizes = {}; list.forEach((size, i) => { const n = each + (i < rest ? 1 : 0); if (n > 0) S.sizes[size] = n; }); schedule(); },
    close: () => closeModal(),
    requestQuoteInstead: () => { S.mode = "quote"; S.error = null; schedule(); },
    newDesign, duplicateDesign, switchDesign, removeDesign, undoRemoveDesign,
    openPreview, closePreview, download, share, submit, submitLabel, closeResult: () => { if (S.result?.previewUrl) URL.revokeObjectURL(S.result.previewUrl); S.result = null; schedule(); },
    dismissError: () => { S.error = null; schedule(); }, dismissNotice: () => { S.notice = null; schedule(); }, dismissLargeArt: () => { S.largeArtNotice = false; schedule(); },
  };

  // ------------------------------------------------------------------ keyboard shortcuts + preflight watcher
  function onKey(e) {
    if (e.key === "Escape" && S.preview.open) { closePreview(); return; }
    if (e.key === "Escape" && overlay && S.open && !S.result) { closeModal(); return; }
    if (!S.activeLayerId || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.key.toLowerCase() === "d") { e.preventDefault(); duplicateLayer(S.activeLayerId); }
    else if (e.key === "]") { e.preventDefault(); reorderLayer(1); }
    else if (e.key === "[") { e.preventDefault(); reorderLayer(-1); }
  }
  document.addEventListener("keydown", onKey);
  let preflightUrl = null;
  // Watch the active image layer and analyse it once.
  function watchPreflight() {
    const l = activeLayer();
    if (!l || l.text) return;
    if (S.preflight?.url === l.artwork.url || preflightUrl === l.artwork.url) return;
    preflightUrl = l.artwork.url;
    analyzeArtwork(l.artwork).then((analysis) => { analyses.set(l.artwork.url, analysis); if (preflightUrl === l.artwork.url) { S.preflight = { url: l.artwork.url, analysis }; schedule(); } });
  }
  const _render = render;
  render = function () { _render(); watchPreflight(); };

  // ------------------------------------------------------------------ boot
  (async () => {
    if (cfg.initialColor) { const sel = resolveColorHint(cfg.initialColor, S.product); if (sel) { S.colorSel = sel; S.designs[0].colorSel = sel; } }
    await fonts.restoreUploaded().catch(() => {});
    fonts.onChange(() => schedule());
    restoreDraft();
    prewarm(S.product);
    render();
  })();
  render();
  return api;
}

export default { mount };
