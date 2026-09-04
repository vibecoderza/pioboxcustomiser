# Piobox Customizer

An embeddable garment design studio: pick a blank, recolor the real product photo to any stocked colorway, Pantone reference or custom hex, drop in artwork (PNG/JPG/WebP/SVG/PDF/AI) or styled text in built‑in, Google, self‑hosted **or customer‑uploaded fonts**, place it on front/back print zones, preflight the file for print, preview, download, share, and hand the whole thing to your cart or quote form.

It is a faithful rebuild of the studio at blankup.org/design with a slightly simplified panel structure (see `docs/UX-REVIEW.md`), packaged as one framework‑free ES module so it can be dropped into any site.

```
index.html                     demo host page (run a static server and open it)
piobox-customizer/
  customizer.js                entry: mount(el, config) → instance API
  customizer.css               all styles, scoped to .pc-shell (tokens overridable)
  core/                        engine: colour maths, Pantone library, photo recolor
                               (worker + main thread), print zones, text raster,
                               artwork import, preflight, compose, drafts
  ui/                          stage (drag/resize/rotate/edit), panels, DOM helpers
  data/                        default catalog (44 blanks), photo frame boxes,
                               Pantone reference library
assets/photos/                 product photography used by the default catalog
assets/fonts/                  the six built‑in typefaces (woff2)
assets/brand/sample-logo.svg   sample artwork for the "Start from" row
docs/UX-REVIEW.md              review of the original fonts/design/layout + what changed
```

> **Photography note.** The 143 photos in `assets/photos` were pulled from blankup.org so the demo is fully functional on day one. They are that studio's product photography and must be replaced with your own before anything goes live. The catalog schema below tells you what to shoot.

## Run the demo

Any static server works (ES modules and the recolor worker need `http://`, not `file://`):

```bash
python3 -m http.server 8765
```

Then open <http://localhost:8765/>. The `.claude/launch.json` entry does the same.

## Embed it

```html
<link rel="stylesheet" href="/piobox-customizer/customizer.css" />
<div id="studio"></div>
<script type="module">
  import { mount } from "/piobox-customizer/customizer.js";

  const studio = mount(document.getElementById("studio"), {
    products,                       // your catalog (schema below); omit to use the demo catalog
    photoBase: "/assets/photos",    // where product photos live
    fontBase: "/assets/fonts",      // where the built‑in woff2 files live
    fonts: [                        // optional extra typefaces
      { id: "brand", label: "Brand", family: "Bebas Neue", weight: "400", google: true },
      { id: "house", label: "House", family: "Piobox Sans", weight: "600", src: "/fonts/piobox-sans.woff2" },
    ],
    allowFontUpload: true,          // customers can upload TTF/OTF/WOFF/WOFF2
    sampleLogo: "/brand/logo.svg",  // optional "try it" artwork
    labels: { submit: "Add to cart", submitWithDesign: "Add design to cart", quoteTab: "Order" },
    onSubmit: async (payload) => { /* send to your cart / quote API */ },
    onShare:  async ({ design, previews }) => { /* store and return { url, expiresAt } */ },
    onEvent:  (name, data) => analytics.track(`customizer_${name}`, data),
  });
</script>
```

The studio fills its host element (a three‑column grid at ≥1280px, stacked below). It restores the customer's draft from `localStorage` automatically and honours `?style=<id>` / `?color=<hint>` in the URL.

### Config reference

| key | default | notes |
| --- | --- | --- |
| `products` | demo catalog | array of products, see schema below |
| `photoBase` / `fontBase` | `assets/photos` / `assets/fonts` | absolute or relative URL bases |
| `photoFrames` | built‑in | `{ "file.webp": { w, h, cx, cy, ar } }` garment bounding box inside each photo (fractions). Needed for accurate print zones on your own photos; see "Photo frames" |
| `photoProtection` | built‑in | `{ "file.webp": { openings: true } }` or `{ hardware: true }` for photos with inner openings (caps) or metal hardware that must keep its colour |
| `fonts` | `[]` | extra typefaces: `{ id, label, family, weight, google: true }` or `{ ..., src: "url.woff2" }` |
| `allowFontUpload` | `true` | show "Upload font" and persist uploads in IndexedDB |
| `sampleLogo` | `null` | URL of a sample artwork for the Start‑from row |
| `initialProductId` / `initialColor` | from URL | product id/style number; colour hint (colorway id, Pantone code/name or hex) |
| `defaultMethod` / `defaultQuantity` | `screen` / `48` | |
| `draftKey` / `persistDraft` | `piobox-customizer-draft-v1` / `true` | |
| `labels` | see `DEFAULT_LABELS` | every visible string that is business‑specific |
| `pdfjsUrl` / `pdfjsWorkerUrl` | cdnjs pdf.js 4.10.38 | PDF/AI import loads pdf.js on demand |
| `onSubmit(payload, api)` | shows a payload modal | your integration (below) |
| `onShare({ design, previews })` | URL‑fragment share | return `{ url, expiresAt? }` |
| `onChange(design)` | | fires after every render |
| `onEvent(name, data)` | | `style, upload, text_add, starter, duplicate, design, save, share, submit, font_upload` |

### Instance API

`mount()` returns `{ getDesign(), getState(), setProduct(idOrStyleNumber), setColor(hint | selection), addFiles(files), addText(), applyStarter(starter), setMethod(m), setQuantity(q), openPreview(), download(), share(), submit(), loadDesign(serialized), fonts, destroy() }`.

## Product schema ("where the products are uploaded")

```js
{
  id: "tee-relaxed",                 // stable id
  name: "Relaxed Tee",
  styleNumber: "PBX-01",             // shown on cards, used in file names
  category: "Tees",                  // Tees | Fleece | Bottoms | Headwear | Outerwear | Accessories
  fit: "Relaxed",                    // Classic | Relaxed | Oversized | Athletic (Oversized → drop‑shoulder zones)
  fabricWeight: "185-200 GSM / 5.45oz",
  colors: [                          // stocked colorways (Core colors row)
    { id: "pfd", label: "PFD", swatchHex: "#f4f4f5" },
    { id: "jet-black", label: "Jet black", swatchHex: "#000000" },
  ],
  photos: {
    front: "relaxed-white.webp",     // REQUIRED: white/PFD garment on a white background — the recolor base
    frontMask: "relaxed-black.webp", // optional: same shot in black — sharpens the garment cut‑out
    frontBlack: "relaxed-black.webp",// optional: shown as‑is when the customer picks black
    back: "relaxed-back-white.webp", // optional: enables the Back side
    backBlack: "relaxed-back-black.webp",
  },
  colorwayImages: { pfd: "relaxed-white.webp", "jet-black": "relaxed-black.webp" },       // per‑colorway front photo
  backColorwayImages: { pfd: "relaxed-back-white.webp", "jet-black": "relaxed-back-black.webp" },
  recolorMode: undefined,            // "cap" recolours only the top of the object (bottle caps)
}
```

**How colour works.** A stocked colorway shows its own photo. Any other colour (Pantone or hex) is produced on the fly by the recolor engine: it segments the white garment out of `photos.front` (using `frontMask` when present), extracts the fabric shading and texture, and maps it through a colour LUT, so seams, folds and shadows stay photographic. This runs in a Web Worker with a main‑thread fallback and is cached per photo/colour.

**Photo requirements.** Front‑on, evenly lit, pure white background (the four corners are sampled as "background"), garment centred, ideally ≥1600px on the long edge. Shooting the same style in black gives the cleanest edges. Photos are the biggest lever on quality.

**Photo frames.** Print zones are defined relative to the garment's bounding box inside the photo. For your own photos add an entry to `photoFrames` (fractions of the image: box width/height `w,h`, centre `cx,cy`, photo aspect `ar = width/height`). If you skip it, the studio falls back to generic category zones which are usually a little off. A one‑line helper to compute it from a cut‑out photo is a good first internal tool; the numbers for the 141 demo photos are in `data/photo-frames.js`.

## Fonts

- **Built‑in:** Impact (Anton), Modern (Geist), Varsity (Graduate), Serif (Playfair Display), Script (Pacifico), Mono (Geist Mono), self‑hosted from `fontBase`.
- **Merchant fonts:** `fonts: [...]` with `google: true` (loaded from Google Fonts) or `src` (any woff2/ttf URL).
- **Customer uploads:** "Upload font" in the text inspector accepts TTF/OTF/WOFF/WOFF2 (≤6 MB). Uploaded fonts are registered with the FontFace API, persisted in IndexedDB so the draft survives a refresh, appear as chips with a preview, and are exported with the order payload (`payload.fonts` as data URLs) so production can install them.

Text layers are rasterised to transparent PNGs (multi‑line, letter spacing, arch/curve, outline) so they follow the same placement, preflight and export path as uploaded art.

## What `onSubmit` receives

```js
{
  product: { id, name, styleNumber, category },
  color: { selection, hex, name, label },           // selection is serialisable (stocked / pantone / custom)
  method: "screen" | "embroidery" | "dtg",
  quantity: 48, notes: "…", email: "…",
  layers: [{ side, placement: { cx, cy, width, rotation, flipX, area }, areaLabel, text, file: File, fileName, isVector, naturalW, naturalH }],
  fonts: [{ name, type, dataUrl }],                  // uploaded fonts used by text layers
  mockups: [{ side, label, blob, file }],            // 2000×2000 PNG per side
  finalPreview: Blob,                                // side‑by‑side PNG
  design, otherDesigns,                              // serialised designs (for reloading later)
}
```

Send the files with `FormData`, or upload them to storage and post the JSON. Set `labels.submit` to match your flow ("Add to cart", "Request a quote", "Continue to checkout").

### Platform notes

- **Custom site / Next.js / Nuxt / Astro:** import the module on the product page, pass the product(s) for that page as `products`, and use `onSubmit` to call your API.
- **Shopify:** fully supported — product-page pop-out, live pricing, add to cart. See **[shopify/README.md](shopify/README.md)** and the working demo at `/shopify-demo.html`.
- **WooCommerce / WordPress:** enqueue the CSS/JS in a small plugin, output the host div via a shortcode, and post `onSubmit` to a REST endpoint that creates a quote or adds a product with custom meta.
- **Webflow / Framer / static:** host the folder anywhere (CDN), embed with an HTML embed block, and point `onSubmit` at a serverless function.

Everything runs in the browser; the only network calls the studio makes on its own are for photos, fonts, and (only when someone uploads a PDF/AI) pdf.js from cdnjs.

## Selling mode (`mode: "cart"`)

Pass a `pricing` config and the enquiry tab becomes a **Size & price** tab: a per-size quantity
run priced off real variants (so 2XL upcharges are correct), decoration priced per print
location with ink colours counted from the artwork itself, setup fees, quantity-break nudges,
and a live total that matches the cart to the penny. `modal: true` turns the whole studio into
a pop-out opened with `studio.open()`. See [shopify/README.md](shopify/README.md).

## Feature parity with the reference studio

Blanks search/filter and 44‑style catalog · stocked colorways · Pantone reference library with popular strip, family filters, name/code search, nearest‑match and ΔE snap · custom HSV/hex picker with eyedropper and recent colours · photo recolor (garment, cap‑only, openings/hardware protection) · front/back sides · print areas with sleeve/leg zones and named placement presets · drag, corner resize, rotate handle with snapping, pinch, scroll‑to‑scale, arrow‑key nudge, centre guides · text layers (6 fonts + custom, ink, outline, curve, spacing, inline editing) · 11 text starters + sample logo · upload PNG/JPG/WebP/SVG/GIF/PDF/AI with size and type checks · artwork preflight (resolution, background, contrast, colour count, halftone, thin lines, method fit, garment‑colour suggestion) · duplicate/flip/reset/reorder/remove with undo · up to six designs per session with duplicate/remove/undo · decoration method and quantity price breaks · notes and e‑mail · preview modal, PNG download, share link, submit hand‑off · draft autosave/restore · keyboard shortcuts (⌘D, ⌘[, ⌘]) · mobile layout.

Added on top: uploadable fonts, merchant font list, configurable labels/callbacks, product photo frames as data instead of code.
