#!/usr/bin/env node
// Vendors the customizer source + fonts into this folder so `vercel` can upload a
// self-contained project. Run automatically by `npm run deploy`.
import { cp, rm, mkdir } from "node:fs/promises";
import path from "node:path";

const here = import.meta.dirname;
const repo = path.resolve(here, "..");

for (const rel of ["piobox-customizer", "assets/fonts"]) {
  const from = path.join(repo, rel);
  const to = path.join(here, rel);
  await rm(to, { recursive: true, force: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`vendored ${rel}`);
}
