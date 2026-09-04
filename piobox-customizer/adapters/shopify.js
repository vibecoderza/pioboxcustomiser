// Shopify adapter: Shopify product JSON + metafields → customizer product, and
// design → cart. See shopify/README.md for the theme snippet and metafield setup.

export const handleize = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Fallback swatches so a colourway always has *some* colour if the merchant hasn't set one.
const NAMED = {
  white: "#f4f4f5", "pfd white": "#f4f4f5", natural: "#e8e0d2", ecru: "#e8e0d2", bone: "#dcd3c1", sand: "#cbb393",
  black: "#111111", "jet black": "#000000", charcoal: "#41424a", grey: "#939597", gray: "#939597", "heather grey": "#b6b8ba",
  navy: "#22344a", royal: "#1d4ed8", blue: "#1c75bc", red: "#c8102e", burgundy: "#7a2233", maroon: "#7a2233",
  green: "#008c45", forest: "#27483f", olive: "#6b703f", sage: "#b7cf9c", yellow: "#f5df4d", gold: "#d6a01d",
  orange: "#f96714", pink: "#f4b9c2", purple: "#5f4b8b", brown: "#6b4d3a", cream: "#ede9e1", stone: "#a99a85",
};
const swatchFor = (label, map) => map?.[label] ?? map?.[handleize(label)] ?? NAMED[String(label).toLowerCase()] ?? "#cccccc";

/**
 * Build a customizer product from Shopify data.
 *
 * @param {object} shopifyProduct  the object from /products/<handle>.js (or Liquid `product | json`)
 * @param {object} config          the `customizer.config` metafield (see shopify/README.md)
 */
export function productFromShopify(shopifyProduct, config = {}) {
  const p = shopifyProduct;
  const colorOption = config.colorOption ?? findOption(p, ["color", "colour"]) ?? "Color";
  const sizeOption = config.sizeOption ?? findOption(p, ["size"]) ?? "Size";
  const idx = (name) => (p.options ?? []).findIndex((o) => (typeof o === "string" ? o : o.name)?.toLowerCase() === String(name).toLowerCase());
  const ci = idx(colorOption), si = idx(sizeOption);
  const optOf = (v, i) => (i < 0 ? null : (v.options?.[i] ?? null));

  const colorways = [], seenColor = new Set();
  const sizes = [], seenSize = new Set();
  const variants = [];
  for (const v of p.variants ?? []) {
    const colorLabel = optOf(v, ci) ?? config.singleColorLabel ?? "Default";
    const sizeLabel = optOf(v, si) ?? config.singleSizeLabel ?? "One size";
    const colorId = handleize(colorLabel);
    if (!seenColor.has(colorId)) { seenColor.add(colorId); colorways.push({ id: colorId, label: colorLabel, swatchHex: swatchFor(colorLabel, config.swatches) }); }
    if (!seenSize.has(sizeLabel)) { seenSize.add(sizeLabel); sizes.push(sizeLabel); }
    variants.push({ id: v.id, colorwayId: colorId, size: sizeLabel, price: v.price, available: v.available !== false, sku: v.sku ?? "", title: v.title });
  }

  const photos = config.photos ?? {};
  return {
    id: config.id ?? p.handle ?? String(p.id),
    name: config.name ?? p.title,
    styleNumber: config.styleNumber ?? (p.variants?.[0]?.sku || p.handle || "").toUpperCase(),
    category: config.category ?? "Tees",
    fit: config.fit ?? "Classic",
    fabricWeight: config.fabricWeight ?? "",
    colors: colorways,
    sizes,
    photos: {
      front: photos.front, frontMask: photos.frontMask, frontBlack: photos.frontBlack,
      back: photos.back, backBlack: photos.backBlack,
    },
    colorwayImages: config.colorwayImages ?? {},
    backColorwayImages: config.backColorwayImages ?? {},
    recolorMode: config.recolorMode,
    // Commerce data the cart adapter needs.
    shopify: { productId: p.id, handle: p.handle, title: p.title, variants, colorOption, sizeOption },
  };
}
function findOption(p, names) {
  for (const o of p.options ?? []) { const n = typeof o === "string" ? o : o?.name; if (n && names.includes(n.toLowerCase())) return n; }
  return null;
}

/** Convenience: fetch a product and its customizer config from the storefront. */
export async function fetchShopifyProduct(handle, { root = "", configUrl } = {}) {
  const res = await fetch(`${root}/products/${handle}.js`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Shopify product ${handle} not found`);
  const product = await res.json();
  let config = product.customizer_config ?? {};
  if (configUrl) { try { config = await (await fetch(configUrl)).json(); } catch { /* keep default */ } }
  return productFromShopify(product, config);
}

// ---------------------------------------------------------------------------------------
// Artwork upload. Shopify cart line items are strings only, so every file has to live at a
// URL before it can be attached to the cart.
// ---------------------------------------------------------------------------------------

/**
 * POST every file in the design to `endpoint` as multipart/form-data and expect
 * `{ files: { "<field>": "<https url>" } }` back. Field names are stable:
 *   mockup-front, mockup-back, preview, art-0, art-1, …, font-0, …
 */
export async function uploadDesignFiles(payload, { endpoint, headers = {}, designId } = {}) {
  if (!endpoint) return null;
  const fd = new FormData();
  fd.append("designId", designId);
  fd.append("meta", JSON.stringify({ product: payload.product, color: payload.color, method: payload.method, quantity: payload.quantity }));
  for (const m of payload.mockups) fd.append(`mockup-${m.side}`, m.file, m.file.name);
  if (payload.finalPreview) fd.append("preview", new File([payload.finalPreview], `${designId}-preview.png`, { type: "image/png" }));
  payload.layers.forEach((l, i) => fd.append(`art-${i}`, l.file, l.fileName));
  payload.fonts.forEach((f, i) => fd.append(`font-${i}`, dataUrlToFile(f.dataUrl, f.name, f.type)));
  fd.append("design", new File([JSON.stringify(payload.design ?? {})], "design.json", { type: "application/json" }));
  fd.append("printArea", JSON.stringify(printAreaOf(payload)));
  const res = await fetch(endpoint, { method: "POST", body: fd, headers });
  if (!res.ok) throw new Error(`Artwork upload failed (${res.status})`);
  const json = await res.json();
  return json.files ?? json;
}
function dataUrlToFile(dataUrl, name, type) {
  const b = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u8 = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
  return new File([u8], name, { type: type || "application/octet-stream" });
}

// ---------------------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------------------

const money = (minor, currency = "GBP") => { try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100); } catch { return (minor / 100).toFixed(2); } };

/** Print-area records stored on the garment line (and uploaded alongside the design JSON). */
export function printAreaOf(payload) {
  return (payload.layers ?? []).map((l) => ({
    side: l.side,
    area: l.areaLabel,
    placement: l.placement,
    fileName: l.fileName,
    text: l.text?.content ?? null,
  }));
}

/** Human-readable summary of the placements, for the cart line and the packing slip. */
export function describeDesign(payload) {
  return payload.layers.map((l, i) => {
    const where = l.areaLabel ? l.areaLabel.toLowerCase() : l.side;
    const what = l.text ? `text “${l.text.content.trim().slice(0, 40)}”` : l.fileName;
    return `${i + 1}. ${l.side} · ${where} · ${what}`;
  }).join(" | ");
}

/**
 * Create an `onSubmit` handler that prices the design and adds it to the Shopify cart.
 *
 * strategy:
 *  "line-items"    (default, no app) garment variants + decoration variants from a price
 *                  ladder product. Decoration unit price is rounded to the ladder step.
 *  "cart-transform" garment variants only, with `_pc_unit_price` properties for a
 *                  Shopify Function (Cart Transform) to apply. Exact, needs your own app.
 *  "draft-order"   POSTs the priced design to your backend, which creates a draft order and
 *                  returns { invoiceUrl }. Exact, no theme app, needs a backend.
 */
export function createShopifyCart(options = {}) {
  const {
    strategy = "line-items",
    root = "",
    uploadEndpoint = null,    // multipart POST endpoint (files pass through your server)
    uploadHeaders = {},
    // Preferred: async (payload, { designId }) => ({ "<field>": "<url>" }).
    // Lets files go straight to storage, bypassing serverless body limits.
    // See vercel-app/src/uploader.js for the Vercel Blob implementation.
    uploadFiles = null,
    ladder = null,            // { productHandle, step, variants: { "<minorPrice>": variantId } }
    setupVariantId = null,    // single fallback setup variant (fixed price)
    // Fixed-price setup variants keyed by decoration method, e.g.
    //   { screen: 50370254143728, embroidery: 50370254176496 }
    // Each variant's Shopify price must equal pricing.methods[<method>].setupPerScreen
    // (or .setupPerPlacement), because the line is added with quantity = screens needed.
    setupVariants = null,
    draftOrderEndpoint = null,
    onAdded = null,           // (result) => void; default redirects to /cart
    redirectTo = "/cart",
    // Refuse to add a decorated item to the cart when its artwork could not be stored —
    // an order production cannot fulfil is worse than a failed add-to-cart.
    requireArtworkUpload = true,
  } = options;

  return async function onSubmit(payload, api) {
    const designId = `PC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const price = payload.price;
    if (!price) throw new Error("Pricing is not configured — pass `pricing` to mount().");
    if (price.blockers.length) throw new Error(price.blockers[0].text);

    // Artwork has to reach a URL before it can ride along on a Shopify line item.
    let files = null;
    if (uploadFiles) files = await uploadFiles(payload, { designId });
    else if (uploadEndpoint) files = await uploadDesignFiles(payload, { endpoint: uploadEndpoint, headers: uploadHeaders, designId });
    if (!files && requireArtworkUpload && payload.layers.length > 0) {
      throw new Error("Artwork storage is not configured, so this design could not be attached to the order. Configure uploadFiles or uploadEndpoint.");
    }

    const summary = describeDesign(payload);
    const filesObj = files && typeof files === "object" ? files : {};
    const printArea = printAreaOf(payload);
    const mockupUrl = filesObj["mockup-front"] || filesObj.preview || "";
    const printFileUrl = filesObj["art-0"] || filesObj["mockup-front"] || filesObj.preview || "";
    const baseProps = {
      _pc_design_id: designId,
      design_id: designId,
      // Where the full design record was written. Underscore-prefixed so the storefront hides it.
      ...(filesObj.design ? { _pc_record: filesObj.design } : {}),
      colour: payload.color.name,
      Colour: payload.color.name,
      "mockup URL": mockupUrl,
      "print-file URL": printFileUrl,
      "print-area JSON": JSON.stringify(printArea).slice(0, 4000),
      Decoration: payload.priceMethodLabel ?? payload.method,
      Artwork: summary || "No artwork",
    };

    if (strategy === "draft-order") {
      if (!draftOrderEndpoint) throw new Error("draftOrderEndpoint is required for the draft-order strategy.");
      const res = await fetch(draftOrderEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json", ...uploadHeaders },
        body: JSON.stringify({ designId, sizes: payload.sizes, price, properties: baseProps, product: payload.product, color: payload.color, method: payload.method, files }),
      });
      if (!res.ok) throw new Error(`Could not create the order (${res.status})`);
      const { invoiceUrl } = await res.json();
      if (onAdded) return onAdded({ designId, invoiceUrl, price });
      location.href = invoiceUrl;
      return;
    }

    const items = [];
    // One line per size, using the real Shopify variant so stock and size are correct.
    for (const s of payload.sizes) {
      if (!s.quantity) continue;
      if (!s.variantId) throw new Error(`No Shopify variant for size ${s.size} in ${payload.color.name}.`);
      items.push({
        id: s.variantId, quantity: s.quantity,
        properties: strategy === "cart-transform"
          ? { ...baseProps, _pc_unit_price: String(price.unitPrice), _pc_decoration_price: String(price.decorationUnit) }
          : baseProps,
      });
    }
    if (!items.length) throw new Error("Add at least one size before adding to the cart.");

    // The garment lines above charge real money. If the quote the customer just saw did not
    // include them, the cart total would silently exceed the quote — refuse rather than ship it.
    const chargesForBlanks = payload.sizes.some((s) => s.quantity > 0 && s.unit > 0);
    const quotedBlanks = price.lines.some((l) => l.kind === "garment");
    if (chargesForBlanks && !quotedBlanks) {
      throw new Error("Pricing is misconfigured: the cart charges for the garment but the quote excludes it. Set pricing.blankSellPrices = true.");
    }

    if (strategy === "line-items") {
      const dec = price.lines.filter((l) => l.kind === "decoration" || l.kind === "surcharge");
      const decUnit = dec.reduce((n, l) => n + l.unit, 0);
      if (decUnit > 0) {
        for (const part of ladderParts(ladder, decUnit)) {
          items.push({
            id: part.variantId, quantity: price.quantity * part.qty,
            properties: { _pc_design_id: designId, "Applies to": payload.product.name, "Decoration": dec.map((l) => l.label).join(", "), _pc_unit: money(part.unit, price.currency) },
          });
        }
      }
      if (decUnit > 0 && !ladder?.variants) throw new Error("Decoration ladder is required so print changes cart money.");
      for (const l of price.lines.filter((x) => x.kind === "setup")) {
        // Preferred: a fixed-price setup variant charged l.qty times (one per screen).
        // The pricing line carries unit + qty, so nothing is hardcoded here — the variant
        // price in Shopify just has to match pricing.methods[method].setupPerScreen.
        const fixed = setupVariants?.[payload.method] ?? setupVariantId;
        if (fixed) {
          items.push({ id: fixed, quantity: Math.max(1, l.qty), properties: { _pc_design_id: designId, "Charge": l.label } });
        } else {
          // No fixed setup variant: bill it off the ladder. A setup fee is usually larger
          // than the top rung, so this must push EVERY part or the customer is undercharged.
          for (const part of ladderParts(ladder, l.total)) {
            items.push({ id: part.variantId, quantity: part.qty, properties: { _pc_design_id: designId, "Charge": l.label } });
          }
        }
      }
    }

    const res = await fetch(`${root}/cart/add.js`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      let msg = `Could not add to cart (${res.status})`;
      try { const j = await res.json(); msg = j.description || j.message || msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    const cart = await res.json();
    document.dispatchEvent(new CustomEvent("piobox:cart:added", { detail: { designId, cart, price } }));
    if (onAdded) return onAdded({ designId, cart, price, api });
    location.href = redirectTo;
  };
}

// Single-line convenience. Only safe when the amount fits one rung — otherwise the caller
// would drop the remaining parts and undercharge, so refuse instead.
function ladderVariant(ladder, amount, fallbackId) {
  const parts = ladderParts(ladder, amount, fallbackId);
  if (parts.length > 1) throw new Error(`${(amount / 100).toFixed(2)} needs ${parts.length} price-ladder lines; use ladderParts() here.`);
  return parts[0];
}

function ladderParts(ladder, amount, fallbackId) {
  if (!ladder?.variants) {
    if (fallbackId) return [{ variantId: fallbackId, unit: amount, qty: 1 }];
    throw new Error("A decoration price ladder is required for the line-items strategy. See shopify/README.md.");
  }
  const step = ladder.step ?? 25;
  const prices = Object.keys(ladder.variants).map(Number).sort((a, b) => a - b);
  const max = prices[prices.length - 1];
  let target = Math.max(prices[0], Math.round(amount / step) * step);
  const parts = [];
  while (target > max) {
    parts.push({ variantId: ladder.variants[max], unit: max, qty: 1 });
    target -= max;
  }
  if (target > 0) {
    const chosen = prices.reduce((best, p) => (Math.abs(p - target) < Math.abs(best - target) ? p : best), prices[0]);
    if (!ladder.variants[chosen]) throw new Error("No decoration variant for " + target);
    parts.push({ variantId: ladder.variants[chosen], unit: chosen, qty: 1 });
  }
  if (!parts.length) throw new Error("Decoration ladder produced no cart lines.");
  // Money check: the lines we are about to add must sum to the amount that was quoted.
  const billed = parts.reduce((n, p) => n + p.unit * p.qty, 0);
  if (billed !== amount) {
    const fmt = (v) => (v / 100).toFixed(2);
    throw new Error(`Price ladder cannot bill ${fmt(amount)} exactly (nearest total ${fmt(billed)}). Set pricing.roundUnitTo to the ladder step (${step}), or add the missing rung.`);
  }
  return parts;
}

/** Demo/dev helper: pretends to upload and add to cart so the flow can be tested offline. */
export function createMockCart({ delay = 600 } = {}) {
  return async function onSubmit(payload) {
    await new Promise((r) => setTimeout(r, delay));
    return { mock: true, payload };
  };
}
