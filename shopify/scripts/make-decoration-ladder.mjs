#!/usr/bin/env node
// Generates the Shopify product CSV for the decoration price ladder, plus the
// customizer.ladder metafield you paste into the shop metafield once imported.
//
//   node shopify/scripts/make-decoration-ladder.mjs --step 25 --max 4000 > decoration-ladder.csv
//
// step/max are in MINOR units (pence). Default: 25p steps up to £40.00 = 160 variants.

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? Number(process.argv[i + 1]) : dflt; };
const step = arg("step", 50), max = arg("max", 10000);
const handle = process.argv.includes("--handle") ? process.argv[process.argv.indexOf("--handle")+1] : "decoration-charge-50c";

const rows = [["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Published", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Requires Shipping", "Variant Taxable", "Status"]];
let first = true;
for (let p = step; p <= max; p += step) {
  const price = (p / 100).toFixed(2);
  rows.push([
    handle,
    first ? "Decoration" : "",
    first ? "Branding charge applied by the Piobox design studio. Not sold on its own." : "",
    first ? "Piobox" : "",
    first ? "Service" : "",
    "FALSE",                    // unpublished: never browsable, still addable to cart
    "Amount",
    price,
    `DEC-${String(p).padStart(6, "0")}`,
    "0", "", "continue", "manual",
    price,
    "FALSE",                    // no shipping on a service line
    "TRUE",
    "active",
  ]);
  first = false;
}
process.stdout.write(rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n");
process.stderr.write(
  `\n${rows.length - 1} variants, ${step}c steps up to R${(max / 100).toFixed(2)}.\n` +
  `Import via Products -> Import. If your store rejects the variant count, split the CSV in\n` +
  `half and import as two ladder products, then merge both into the ladder metafield.\n\n` +
  `Then read the variant IDs back and build the customizer.ladder metafield:\n` +
  `  { "step": ${step}, "variants": { "50": <id>, "100": <id>, ... } }\n` +
  `Amounts above the top rung are split across several lines automatically.\n`);
