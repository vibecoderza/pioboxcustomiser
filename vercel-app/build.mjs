// Bundles the customizer into plain ES modules the Shopify theme can import directly,
// and copies the fonts + photos alongside them. No theme assets to keep in sync.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Source lives one level up in the working repo, but is vendored alongside when deployed.
const here = import.meta.dirname;
const root = existsSync(path.join(here, "piobox-customizer")) ? here : path.resolve(here, "..");
const out = path.resolve(import.meta.dirname, "public");

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
  entryPoints: [path.join(import.meta.dirname, "src/uploader.js")],
  outfile: path.join(out, "piobox-customizer/uploader.js"),
});

await cp(path.join(root, "piobox-customizer/customizer.css"), path.join(out, "piobox-customizer/customizer.css"));
for (const dir of ["fonts", "photos", "brand"]) {
  const from = path.join(root, "assets", dir);
  if (existsSync(from)) await cp(from, path.join(out, "assets", dir), { recursive: true });
}
console.log("built -> vercel-app/public");
