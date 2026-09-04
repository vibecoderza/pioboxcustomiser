// piobox-customizer/adapters/shopify.js
var handleize = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
var NAMED = {
  white: "#f4f4f5",
  "pfd white": "#f4f4f5",
  natural: "#e8e0d2",
  ecru: "#e8e0d2",
  bone: "#dcd3c1",
  sand: "#cbb393",
  black: "#111111",
  "jet black": "#000000",
  charcoal: "#41424a",
  grey: "#939597",
  gray: "#939597",
  "heather grey": "#b6b8ba",
  navy: "#22344a",
  royal: "#1d4ed8",
  blue: "#1c75bc",
  red: "#c8102e",
  burgundy: "#7a2233",
  maroon: "#7a2233",
  green: "#008c45",
  forest: "#27483f",
  olive: "#6b703f",
  sage: "#b7cf9c",
  yellow: "#f5df4d",
  gold: "#d6a01d",
  orange: "#f96714",
  pink: "#f4b9c2",
  purple: "#5f4b8b",
  brown: "#6b4d3a",
  cream: "#ede9e1",
  stone: "#a99a85"
};
var swatchFor = (label, map) => map?.[label] ?? map?.[handleize(label)] ?? NAMED[String(label).toLowerCase()] ?? "#cccccc";
function productFromShopify(shopifyProduct, config = {}) {
  const p = shopifyProduct;
  const colorOption = config.colorOption ?? findOption(p, ["color", "colour"]) ?? "Color";
  const sizeOption = config.sizeOption ?? findOption(p, ["size"]) ?? "Size";
  const idx = (name) => (p.options ?? []).findIndex((o) => (typeof o === "string" ? o : o.name)?.toLowerCase() === String(name).toLowerCase());
  const ci = idx(colorOption), si = idx(sizeOption);
  const optOf = (v, i) => i < 0 ? null : v.options?.[i] ?? null;
  const colorways = [], seenColor = /* @__PURE__ */ new Set();
  const sizes = [], seenSize = /* @__PURE__ */ new Set();
  const variants = [];
  for (const v of p.variants ?? []) {
    const colorLabel = optOf(v, ci) ?? config.singleColorLabel ?? "Default";
    const sizeLabel = optOf(v, si) ?? config.singleSizeLabel ?? "One size";
    const colorId = handleize(colorLabel);
    if (!seenColor.has(colorId)) {
      seenColor.add(colorId);
      colorways.push({ id: colorId, label: colorLabel, swatchHex: swatchFor(colorLabel, config.swatches) });
    }
    if (!seenSize.has(sizeLabel)) {
      seenSize.add(sizeLabel);
      sizes.push(sizeLabel);
    }
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
      front: photos.front,
      frontMask: photos.frontMask,
      frontBlack: photos.frontBlack,
      back: photos.back,
      backBlack: photos.backBlack
    },
    colorwayImages: config.colorwayImages ?? {},
    backColorwayImages: config.backColorwayImages ?? {},
    recolorMode: config.recolorMode,
    // Commerce data the cart adapter needs.
    shopify: { productId: p.id, handle: p.handle, title: p.title, variants, colorOption, sizeOption }
  };
}
function findOption(p, names) {
  for (const o of p.options ?? []) {
    const n = typeof o === "string" ? o : o?.name;
    if (n && names.includes(n.toLowerCase())) return n;
  }
  return null;
}
async function fetchShopifyProduct(handle, { root = "", configUrl } = {}) {
  const res = await fetch(`${root}/products/${handle}.js`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Shopify product ${handle} not found`);
  const product = await res.json();
  let config = product.customizer_config ?? {};
  if (configUrl) {
    try {
      config = await (await fetch(configUrl)).json();
    } catch {
    }
  }
  return productFromShopify(product, config);
}
async function uploadDesignFiles(payload, { endpoint, headers = {}, designId } = {}) {
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
var money = (minor, currency = "GBP") => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
  } catch {
    return (minor / 100).toFixed(2);
  }
};
function printAreaOf(payload) {
  return (payload.layers ?? []).map((l) => ({
    side: l.side,
    area: l.areaLabel,
    placement: l.placement,
    fileName: l.fileName,
    text: l.text?.content ?? null
  }));
}
function describeDesign(payload) {
  return payload.layers.map((l, i) => {
    const where = l.areaLabel ? l.areaLabel.toLowerCase() : l.side;
    const what = l.text ? `text \u201C${l.text.content.trim().slice(0, 40)}\u201D` : l.fileName;
    return `${i + 1}. ${l.side} \xB7 ${where} \xB7 ${what}`;
  }).join(" | ");
}
function createShopifyCart(options = {}) {
  const {
    strategy = "line-items",
    root = "",
    uploadEndpoint = null,
    uploadHeaders = {},
    ladder = null,
    // { productHandle, step, variants: { "<minorPrice>": variantId } }
    setupVariantId = null,
    // ladder variant used for one-off setup fees (same step)
    setupVariants = null,
    // { screen, embroidery } exact unpublished setup variant ids
    draftOrderEndpoint = null,
    onAdded = null,
    // (result) => void; default redirects to /cart
    redirectTo = "/cart"
  } = options;
  return async function onSubmit(payload, api) {
    const designId = `PC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const price = payload.price;
    if (!price) throw new Error("Pricing is not configured \u2014 pass `pricing` to mount().");
    if (price.blockers.length) throw new Error(price.blockers[0].text);
    const files = await uploadDesignFiles(payload, { endpoint: uploadEndpoint, headers: uploadHeaders, designId }).catch((e) => {
      if (uploadEndpoint) throw e;
      return null;
    });
    const summary = describeDesign(payload);
    const filesObj = files && typeof files === "object" ? files : {};
    const printArea = printAreaOf(payload);
    const mockupUrl = filesObj["mockup-front"] || filesObj.preview || "";
    const printFileUrl = filesObj["art-0"] || filesObj["mockup-front"] || filesObj.preview || "";
    const baseProps = {
      _pc_design_id: designId,
      design_id: designId,
      colour: payload.color.name,
      Colour: payload.color.name,
      "mockup URL": mockupUrl,
      "print-file URL": printFileUrl,
      "print-area JSON": JSON.stringify(printArea).slice(0, 4e3),
      Decoration: payload.priceMethodLabel ?? payload.method,
      Artwork: summary || "No artwork"
    };
    if (strategy === "draft-order") {
      if (!draftOrderEndpoint) throw new Error("draftOrderEndpoint is required for the draft-order strategy.");
      const res2 = await fetch(draftOrderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...uploadHeaders },
        body: JSON.stringify({ designId, sizes: payload.sizes, price, properties: baseProps, product: payload.product, color: payload.color, method: payload.method, files })
      });
      if (!res2.ok) throw new Error(`Could not create the order (${res2.status})`);
      const { invoiceUrl } = await res2.json();
      if (onAdded) return onAdded({ designId, invoiceUrl, price });
      location.href = invoiceUrl;
      return;
    }
    const items = [];
    for (const s of payload.sizes) {
      if (!s.quantity) continue;
      if (!s.variantId) throw new Error(`No Shopify variant for size ${s.size} in ${payload.color.name}.`);
      items.push({
        id: s.variantId,
        quantity: s.quantity,
        properties: strategy === "cart-transform" ? { ...baseProps, _pc_unit_price: String(price.unitPrice), _pc_decoration_price: String(price.decorationUnit) } : baseProps
      });
    }
    if (!items.length) throw new Error("Add at least one size before adding to the cart.");
    if (strategy === "line-items") {
      const dec = price.lines.filter((l) => l.kind === "decoration" || l.kind === "surcharge");
      const decUnit = dec.reduce((n, l) => n + l.unit, 0);
      if (decUnit > 0) {
        for (const part of ladderParts(ladder, decUnit)) {
          items.push({
            id: part.variantId,
            quantity: price.quantity * part.qty,
            properties: { _pc_design_id: designId, "Applies to": payload.product.name, "Decoration": dec.map((l) => l.label).join(", "), _pc_unit: money(part.unit, price.currency) }
          });
        }
      }
      if (decUnit > 0 && !ladder?.variants) throw new Error("Decoration ladder is required so print changes cart money.");
      const setup = price.lines.filter((l) => l.kind === "setup");
      for (const l of setup) {
        const methodKey = payload.method;
        const named = setupVariants?.[methodKey] || setupVariantId;
        if (named && (methodKey === "screen" || methodKey === "embroidery")) {
          const unit = methodKey === "embroidery" ? 3e4 : 35e3;
          const qty = Math.max(1, Math.round(l.total / unit));
          items.push({ id: named, quantity: qty, properties: { _pc_design_id: designId, "Charge": l.label } });
        } else {
          const { variantId } = ladderVariant(ladder, l.total, setupVariantId);
          items.push({ id: variantId, quantity: 1, properties: { _pc_design_id: designId, "Charge": l.label } });
        }
      }
    }
    const res = await fetch(`${root}/cart/add.js`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items })
    });
    if (!res.ok) {
      let msg = `Could not add to cart (${res.status})`;
      try {
        const j = await res.json();
        msg = j.description || j.message || msg;
      } catch {
      }
      throw new Error(msg);
    }
    const cart = await res.json();
    document.dispatchEvent(new CustomEvent("piobox:cart:added", { detail: { designId, cart, price } }));
    if (onAdded) return onAdded({ designId, cart, price, api });
    location.href = redirectTo;
  };
}
function ladderVariant(ladder, amount, fallbackId) {
  const parts = ladderParts(ladder, amount, fallbackId);
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
    const chosen = prices.reduce((best, p) => Math.abs(p - target) < Math.abs(best - target) ? p : best, prices[0]);
    if (!ladder.variants[chosen]) throw new Error("No decoration variant for " + target);
    parts.push({ variantId: ladder.variants[chosen], unit: chosen, qty: 1 });
  }
  if (!parts.length) throw new Error("Decoration ladder produced no cart lines.");
  return parts;
}
function createMockCart({ delay = 600 } = {}) {
  return async function onSubmit(payload) {
    await new Promise((r) => setTimeout(r, delay));
    return { mock: true, payload };
  };
}
export {
  createMockCart,
  createShopifyCart,
  describeDesign,
  fetchShopifyProduct,
  handleize,
  printAreaOf,
  productFromShopify,
  uploadDesignFiles
};
