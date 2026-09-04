# Review of the reference studio (blankup.org/design) and what the rebuild changes

## Fonts

| role | typeface | where |
| --- | --- | --- |
| UI text | **Geist** (100–900 variable), Arial fallback with size‑adjust | everything |
| Codes, meta, hex fields | **Geist Mono** | style numbers, Pantone codes, counters |
| Text tool "Impact" | Anton 400 | |
| Text tool "Modern" | Geist 600 | |
| Text tool "Varsity" | Graduate 400 | |
| Text tool "Serif" | Playfair Display 600 | |
| Text tool "Script" | Pacifico 400 | |
| Text tool "Mono" | Geist Mono 500 | |

All six are self‑hosted woff2 (latin subsets) loaded with `font-display: swap`. The rebuild ships the same files under `assets/fonts` and adds a registry so merchants can add Google/self‑hosted faces and customers can upload their own.

## Design tokens

Background `#fefcf9` (warm off‑white), card `#fff`, foreground `#101418`, muted text `#50565c`, tertiary `#686c71`, panel `#f4f3f0`, border `#e1e3e5`, soft rule `#edeff0`, primary `#11161d`, ring `#555f6b`, destructive `#e40014`, radius `.625rem`, motion `.18s cubic-bezier(.22,1,.36,1)`, elevation shadows `0 1px 2px` and `0 8px 24px -16px`. Overlines are 12px, 500, `.08em` tracking, uppercase. The stage is a white rounded square with a soft drop shadow and 2.2% inner padding. These are reproduced 1:1 as CSS custom properties on `.pc-shell`.

## Layout (≥1280px)

Three columns `19rem | 1fr | 20rem` (24/26rem at ≥1536px) inside a fixed‑height shell (`min(60rem, max(38rem, 100dvh − 9rem))`). Row 1 spans all columns: the **Designs** rail (up to six designs, New/Duplicate). Row 2: **Blanks** (search, category select, 2‑column grid, "Browse all"), **stage** (layers rail on the left, garment centre, Front/Back thumbnails on the right), **options** (accordion: Color · Artwork & text · Request a quote). Row 3 spans all columns: **bottom bar** (current blank, current colour, Share, Download, Preview, primary CTA). Below 1280px the sections stack: stage → blanks → options → bar.

## How the customizer works (verified from the shipped bundle)

1. **Catalog** is server‑rendered into the page: 44 styles with `colors`, front/back photos in white and black, and a per‑photo bounding box table.
2. **Colour** has three kinds of selection: stocked colorway (real photo), Pantone reference (127‑entry curated library with aliases, families, ΔE‑2000 nearest match, code‑distance nearest match) and custom hex (HSV square, hue slider, hex input, EyeDropper, recents, "nearest Pantone / Snap").
3. **Recolor** segments the white garment photo (corner‑sampled background flood, majority filter, hole filling, background‑pocket carving, small‑component removal, edge trim, largest component), optionally aligned against the black shot, builds a luma/tone map with wide and mid box‑blurs and soft knees, a texture map, and a soft alpha; a 256‑entry LUT maps tone → target colour with black/white mixing stops. Caps use an "openings" protector; lanyards/pins a "hardware" keeper. Bottles recolour only the cap. Runs in a worker with a 6s timeout and main‑thread fallback; results cached as WebP data URLs.
4. **Print zones** are garment‑relative (u/v of the garment box) per layout: short‑sleeve, drop‑sleeve, long‑sleeve, long‑sleeve‑crop, bottoms long/short, plus per‑accessory panels (tote, bottle, cap crown, beanie cuff, socks, mousepad, …). Sleeve/leg zones are mirrored for the opposite side. Placements are clamped to their zone accounting for rotation and aspect ratio, and remapped when switching blanks.
5. **Stage** supports move (with centre‑line and chest‑line snapping), corner resize, rotate handle with 0/±45/±90 snaps, two‑finger pinch‑rotate, wheel scaling, arrow nudges (Shift = coarse), Delete, Enter/double‑click to edit text inline, drag‑and‑drop upload, print‑area outlines while dragging.
6. **Text** is rasterised on a canvas at 400px (or less for long strings), supports multiline, letter spacing 0–40%, curve −100…100% (per‑character placement on an arc), 8% outline, ink/outline palettes plus custom, and is re‑rendered 160ms after each change.
7. **Artwork** import accepts PNG/JPG/WebP/SVG/GIF and converts PDF/AI via pdf.js (probe at 640px, find ink bounds, re‑render cropped up to 2400px). Max 25 MB. Drafts keep files ≤2 MB inline.
8. **Preflight** analyses a 1024px sample: alpha, solid background, ink clusters (ΔE‑merged), continuous tone, halo, thin‑line erosion, DPI at the printed width (stage = 22 in), and produces findings + method fit for screen/DTG/embroidery, plus a "switch garment to X so the art pops" suggestion.
9. **Export**: per‑side 2000px PNG (with a BACK badge when mirrored) for the preview modal; side‑by‑side 1600px tiles for download and share previews.
10. **Hand‑off**: quantity (3/12/25/50/100/250/500 breaks), notes auto‑filled with colour spec and placement list, optional e‑mail lead capture, draft written to localStorage, then navigation to the quote page with the design in sessionStorage. Share posts to an API and copies a 90‑day link.

## UX simplifications in the rebuild (all features kept)

1. **Tabs instead of stacked accordions** in the options column (Color · Artwork & text · Quote). Each tab header shows its state (colour dot + name, layer count, quantity) so nothing is lost when collapsed, and the column no longer grows to 3–4 screens tall.
2. **Contextual inspector.** Selecting a layer replaces the "Add" row with a "‹ Text layer / Artwork layer" inspector; deselecting brings the add/starters row back. In the original both stacked, so users scrolled past controls they were not using.
3. **Colour search is always visible.** The "Advanced colors → Show all" toggle is gone; the search box and family chips sit directly under Popular (one click fewer to reach 127 colours).
4. **Category chips instead of a `<select>`** in Blanks: faster scanning, works with search, no native dropdown on mobile.
5. **Decoration method moved to the Quote tab**, next to quantity, where the pricing decision is actually made; the stage caption still says "Screen print preview · Left chest" so the preview context stays visible.
6. **Font upload lives next to the font chips**, with uploaded fonts rendered in their own face and a small manager to remove them.
7. **Text size stepper, ink and outline rows, curve/spacing sliders** are unchanged in behaviour but grouped under one "Text" block.
8. Everything else (rail, stage, layers rail, side thumbnails, bottom bar, preview modal, undo toasts, keyboard shortcuts) matches the original.

## Things to decide before going live

- Replace the placeholder photography (`assets/photos`) with your own front/back white + black shots and fill `photoFrames`.
- Decide the hand‑off: cart line item vs. quote request (`labels.submit`, `onSubmit`).
- Provide a share endpoint (`onShare`) if you want links that include uploaded images; the default fallback only carries text layers in the URL.
- Optional: host pdf.js yourself (`pdfjsUrl`) if your CSP blocks cdnjs.
