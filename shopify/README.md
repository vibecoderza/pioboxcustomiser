# Running the customizer on Shopify

The studio opens as a pop-out from any product page, reads that product's colourways, sizes
and variant prices from Shopify, prices the branding live, and adds everything to the cart.

Demo of the whole flow, no Shopify account needed: **`/shopify-demo.html`**.

---

## The three Shopify constraints that shape the design

Everything below follows from these. They are platform limits, not choices in this codebase.

**1. A cart line item can only hold strings.** You cannot attach a file to the cart. So every
piece of artwork — the customer's logo, the generated mockups, any uploaded font — must be
uploaded somewhere first, and the cart stores the URL. You need one small endpoint for this
(`uploadEndpoint`). ~40 lines on a Cloudflare Worker, Vercel function or your own server.

**2. A cart line's price always comes from a variant.** You cannot post an arbitrary price to
`/cart/add.js`. Branding is a calculated amount, so it has to become a variant price, a
Shopify Function, or a draft order. Three supported strategies below.

**3. A custom Pantone garment colour is not a variant.** It is a production run. The studio
treats it as a surcharge with its own minimum quantity, and offers "request a quote instead"
when the order is below it.

---

## Choose a cart strategy

| Strategy | Exact price? | Needs | Cart shows |
| --- | --- | --- | --- |
| **`line-items`** (default) | To the ladder step (25p) | No app | Garment lines + a "Decoration" line + setup lines |
| **`cart-transform`** | Exact | Your own Shopify app with a Cart Transform Function | One line per size, priced correctly |
| **`draft-order`** | Exact | Backend endpoint | Redirects to a Shopify invoice/checkout |

`line-items` is the fastest to launch and works on every plan. It charges branding through a
hidden **Decoration** product whose variants are a ladder of fixed prices (25p, 50p, 75p …).
The studio rounds the branding charge to the same step (`pricing.roundUnitTo`), so **the price
the customer is quoted is exactly the price in the cart**.

---

## Setup

### 1. Upload the plugin to your theme

Copy into `assets/` (Shopify flattens folders, so keep the flat names):

```
piobox-customizer.css            ← piobox-customizer/customizer.css
piobox-customizer.js             ← piobox-customizer/customizer.js  (+ core/ ui/ data/)
piobox-shopify-adapter.js        ← piobox-customizer/adapters/shopify.js
```

Because the code is ES modules with relative imports, the simplest reliable route is to serve
the `piobox-customizer/` folder from a CDN (Cloudflare Pages, Netlify, your own bucket) and
point the snippet's imports at it. Bundling into a single asset also works if you already have
a build step.

Copy `shopify/snippets/piobox-customizer.liquid` into `snippets/` and render it on the product
template:

```liquid
{% render 'piobox-customizer', product: product %}
```

### 2. Product photography

Upload to **Content → Files**. Per style you need, at minimum, a front photo of the garment in
white on a pure white background. Add the others for better results:

| File | Why |
| --- | --- |
| `front` | **Required.** The recolour base. |
| `frontMask` | Same shot in black — sharpens the cut-out. Strongly recommended. |
| `frontBlack` | Shown as-is when the customer picks black. |
| `back`, `backBlack` | Enables the back side. |

### 3. Product metafield: `customizer.config` (JSON)

Definition: namespace `customizer`, key `config`, type JSON, on Products.

```json
{
  "category": "Tees",
  "fit": "Relaxed",
  "styleNumber": "PBX-01",
  "fabricWeight": "185-200 GSM",
  "buttonLabel": "Design yours",
  "colorOption": "Colour",
  "sizeOption": "Size",
  "swatches": { "PFD White": "#f4f4f5", "Jet black": "#000000" },
  "photos": {
    "front": "https://cdn.shopify.com/s/files/.../tee-white.webp",
    "frontMask": "https://cdn.shopify.com/s/files/.../tee-black.webp",
    "frontBlack": "https://cdn.shopify.com/s/files/.../tee-black.webp",
    "back": "https://cdn.shopify.com/s/files/.../tee-back-white.webp",
    "backBlack": "https://cdn.shopify.com/s/files/.../tee-back-black.webp"
  },
  "colorwayImages": {
    "pfd-white": "https://cdn.shopify.com/s/files/.../tee-white.webp",
    "jet-black": "https://cdn.shopify.com/s/files/.../tee-black.webp"
  },
  "frames": {
    "tee-white.webp": { "w": 0.9766, "h": 0.9414, "cx": 0.5, "cy": 0.498, "ar": 1 }
  },
  "cartStrategy": "line-items",
  "uploadEndpoint": "https://your-worker.example.com/design-upload"
}
```

`category` drives the print zones (`Tees`, `Fleece`, `Bottoms`, `Headwear`, `Outerwear`,
`Accessories`). `frames` is the garment's bounding box inside each photo — see the main
README; without it the studio falls back to generic zones, which sit a little off.

Colourway keys are the **handleized option value**: `"PFD White"` → `pfd-white`.

### 4. Shop metafield: `customizer.pricing` (JSON)

Definition: namespace `customizer`, key `pricing`, type JSON, on Shop. Only include what you
want to override — anything omitted falls back to the defaults in `core/pricing.js`.

```json
{
  "currency": "GBP",
  "locale": "en-GB",
  "minimumQty": 3,
  "methods": {
    "screen": {
      "setupPerScreen": 1200,
      "setupWaivedAtQty": 250,
      "maxColors": 8,
      "bands": [
        { "minQty": 1,   "base": 380, "perExtraColor": 130 },
        { "minQty": 25,  "base": 250, "perExtraColor": 90 },
        { "minQty": 100, "base": 150, "perExtraColor": 55 },
        { "minQty": 500, "base": 90,  "perExtraColor": 30 }
      ]
    }
  },
  "customColor": { "surchargePerUnit": 180, "minQty": 250 }
}
```

All money is in **pence**. Pricing is charged **per print location**, not per layer: two text
layers on the same chest are one print, and their ink colours are unioned for screen counts.
The ink-colour count comes from the artwork itself — the studio's preflight analysis counts
distinct colours in the uploaded file.

### 5. The decoration ladder (`line-items` strategy only)

```bash
node shopify/scripts/make-decoration-ladder.mjs --step 25 --max 4000 > decoration-ladder.csv
```

Import that CSV (Products → Import). It creates an **unpublished** "Decoration" product — not
browsable, but still addable to the cart. Then build the shop metafield `customizer.ladder`
from the resulting variant IDs:

```json
{ "step": 25, "variants": { "25": 43512345678901, "50": 43512345678902, "75": "…" } }
```

> Classic Shopify plans cap a product at 100 variants. 25p × 100 covers branding up to £25 per
> piece. If you need more headroom, raise `--step` or split across two ladder products.

Hide these lines in the cart with a little theme CSS keyed on the `_pc_design_id` property, or
leave them visible — customers generally understand a "Decoration" line.

### 6. The upload endpoint

The adapter POSTs `multipart/form-data` with fields `designId`, `meta`, `mockup-front`,
`mockup-back`, `preview`, `art-0…`, `font-0…`. Respond with:

```json
{ "files": { "preview": "https://…/preview.png", "mockup-front": "https://…", "art-0": "https://…" } }
```

Those URLs become hidden `_pc_*` line-item properties, visible on the order in admin so
production can pull the print-ready files. Store them somewhere durable — customers may order
weeks after designing.

---

## What ends up on the order

Each size becomes its own line against the real Shopify variant, so stock, sizing and reports
all behave normally. Every line carries:

| Property | Visible? | Contents |
| --- | --- | --- |
| `_pc_design_id` | hidden | Groups the garment, decoration and setup lines |
| `Colour` | shown | `PFD White`, or `Pantone 19-4052 TCX · Classic Blue` |
| `Decoration` | shown | `Screen print` |
| `Artwork` | shown | `1. front · center chest · text "YOUR CITY"` |
| `_pc_preview`, `_pc_mockup-front`, `_pc_art-0` | hidden | Hosted file URLs |
| `_pc_spec` | hidden | Full JSON spec: colour, method, placements, text |

---

## Option: exact pricing with a Shopify Function

If you want a single, correctly-priced line per size instead of a separate branding line, set
`cartStrategy: "cart-transform"`. The adapter then adds only the garment variants and attaches
`_pc_unit_price` (in pence). Your Cart Transform Function reads that property and applies an
`update` operation to the line price. This needs a custom app you install on your own store —
no App Store review — but it is real development work, so start with `line-items` and move
later if the extra cart line bothers you.

Availability of price adjustment in Cart Transform depends on your Shopify plan; check the
current Shopify Functions docs for your plan before committing to this route.
