// Bundles the customizer into plain ES modules the Shopify theme can import directly,
// and copies the fonts + photos alongside them. No theme assets to keep in sync.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Repo root is both the source location and the Vercel project root, so the deployed
// bundle is always built from the source in this commit — there is no copy to go stale.
const root = import.meta.dirname;
const out = path.join(root, "public");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "piobox-customizer"), { recursive: true });

const shared = { bundle: true, format: "esm", target: "es2022", minify: true, sourcemap: true, legalComments: "none" };

await build({
  ...shared,
  entryPoints: [path.join(root, "piobox-customizer/customizer.js")],
  outfile: path.join(out, "piobox-customizer/customizer.js"),
  // The recolor worker is loaded with new URL(...) — keep it a separate file.
  loader: { ".woff2": "file" },
});
// The bundled customizer resolves the worker as new URL("./recolor.worker.js", import.meta.url),
// which is relative to customizer.js — so it must sit next to it, not under core/.
await build({
  ...shared,
  entryPoints: [path.join(root, "piobox-customizer/core/recolor.worker.js")],
  outfile: path.join(out, "piobox-customizer/recolor.worker.js"),
});
await build({
  ...shared,
  entryPoints: [path.join(root, "piobox-customizer/adapters/shopify.js")],
  outfile: path.join(out, "piobox-customizer/shopify-adapter.js"),
});
// Browser uploader: wraps @vercel/blob/client so the storefront needs no CDN dependency.
await build({
  ...shared,
  entryPoints: [path.join(root, "src/uploader.js")],
  outfile: path.join(out, "piobox-customizer/uploader.js"),
});
// Print-zone maths on its own, so the admin app can draw exactly the areas the studio will
// enforce. Importing the real module beats reimplementing it and letting the two drift.
await build({
  ...shared,
  entryPoints: [path.join(root, "piobox-customizer/core/placements.js")],
  outfile: path.join(out, "piobox-customizer/placements.js"),
});

await cp(path.join(root, "piobox-customizer/customizer.css"), path.join(out, "piobox-customizer/customizer.css"));
for (const dir of ["fonts", "photos", "brand"]) {
  const from = path.join(root, "assets", dir);
  if (existsSync(from)) await cp(from, path.join(out, "assets", dir), { recursive: true });
}
console.log("built -> public");
