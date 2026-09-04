#!/usr/bin/env node
// What every template costs, what it should sell for, and where the number came from.
//   node shopify/scripts/pricing-report.mjs [--markup 2.2] [--csv]
import { DEFAULT_CATALOG } from "../../piobox-customizer/data/catalog.js";
import { blankCostFor, sellPriceFrom, SUPPLIER_MAP } from "../../piobox-customizer/data/suppliers.js";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const markup = arg("markup", 2.2);
const asCsv = process.argv.includes("--csv");
const R = (c) => `R${(c / 100).toFixed(2)}`;

const rows = DEFAULT_CATALOG.map((p) => {
  const b = blankCostFor(p.styleNumber, p.category);
  const sell = b ? sellPriceFrom(b.cost, { markup }) : null;
  return {
    style: p.styleNumber, name: p.name, category: p.category,
    supplier: b?.supplier ?? "", sku: b?.sku ?? "", source: b?.source ?? "none",
    cost: b?.cost ?? null, sell, margin: b && sell ? sell - b.cost : null,
  };
});

if (asCsv) {
  console.log("style,name,category,supplier,sku,source,blank cost ZAR,sell price ZAR,gross margin ZAR");
  for (const r of rows) console.log([r.style, `"${r.name}"`, r.category, r.supplier, r.sku, r.source,
    r.cost != null ? (r.cost / 100).toFixed(2) : "", r.sell != null ? (r.sell / 100).toFixed(2) : "",
    r.margin != null ? (r.margin / 100).toFixed(2) : ""].join(","));
} else {
  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`\nMarkup ${markup}× on blank cost. All ZAR ex VAT.\n`);
  console.log(w("STYLE", 12) + w("NAME", 26) + w("SOURCE", 12) + w("SKU", 11) + w("COST", 10) + w("SELL", 10) + "MARGIN");
  console.log("-".repeat(88));
  for (const r of rows) {
    console.log(w(r.style, 12) + w(r.name, 26) + w(r.source, 12) + w(r.sku || "-", 11) +
      w(r.cost != null ? R(r.cost) : "-", 10) + w(r.sell != null ? R(r.sell) : "-", 10) + (r.margin != null ? R(r.margin) : "-"));
  }
  const real = rows.filter((r) => r.source === "supplier").length;
  console.log("-".repeat(88));
  console.log(`${real} of ${rows.length} templates have a confirmed supplier cost. ${rows.length - real} use placeholders.`);
  console.log(`Confirmed mappings: ${Object.keys(SUPPLIER_MAP).length}. Everything else is provisional — check before quoting big runs.\n`);
}
