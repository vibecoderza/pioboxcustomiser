# Piobox Customizer — Vercel host

Serves the customizer (ES modules, fonts, photos) **and** handles design-file uploads. Hosting
here removes three problems at once: no bundling into theme assets, fonts actually load, and
artwork bypasses Shopify's inability to carry files on a cart line.

## Deploy

Live at **https://studio.blankd.co.za** (an A record for `studio` → `76.76.21.21`; the project
also answers on its `piobox-customizer.vercel.app` URL). The theme snippet imports the custom
domain, so the store keeps working even if the project moves off Vercel.

Do not switch `blankd.co.za`'s nameservers to Vercel's — the apex and `www` point at Shopify,
and delegating the zone would take the storefront down.

```bash
npm run deploy
```

Run it from the repo root. `npm run deploy` and `npx vercel --prod` are equivalent — the
project root *is* the repo root, so the deploy uploads exactly the files the build reads.

Check it: `curl https://studio.blankd.co.za/api/health`.

### Keeping deploys fast

Two settings keep the build at ~15s instead of ~6min. Don't remove them without measuring:

- **`installCommand` in `vercel.json`** pins `--no-audit --no-fund --ignore-scripts
  --prefer-offline`. Without it, npm stalls for a flat 5 minutes on the build machine even when
  there is nothing to install (`up to date in 5m`) — audit/funding metadata plus the npm 11
  `allow-scripts` approval check. `.npmrc` sets the same flags for local runs.
- **The `vercel` CLI is deliberately *not* a dependency.** It was in `devDependencies`, so every
  build installed the entire CLI. Invoke it with `npx` instead.

### Uploads

Uploads use the **presigned flow**, not a static token: the connected Blob store authenticates
via OIDC (`BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`), so there is no `BLOB_READ_WRITE_TOKEN`
and there should not be one. `api/health` reports `uploads.staticToken: false` — that is correct,
not a fault. `api/upload.js` uses `issueSignedToken` + `handleUploadPresigned` accordingly.

Both API handlers use the Node `(req, res)` signature. The web-standard `Request`/`Response`
form is not detected reliably here and silently hangs the request until it times out.

## What it exposes

| Path | Purpose |
| --- | --- |
| `/piobox-customizer/customizer.js` | the studio (bundled ES module) |
| `/piobox-customizer/shopify-adapter.js` | product mapping + cart |
| `/piobox-customizer/uploader.js` | browser uploader (Vercel Blob) |
| `/piobox-customizer/customizer.css` | styles |
| `/assets/fonts/*.woff2` | the six built-in typefaces |
| `/assets/photos/*` | template photography |
| `/api/upload` | issues Blob client tokens |
| `/api/health` | config check |

## Wiring the Shopify snippet

Replace the `asset_url` imports in `snippets/piobox-customizer-live.liquid`:

```js
const HOST = "https://<project>.vercel.app";
const { mount } = await import(`${HOST}/piobox-customizer/customizer.js`);
const { productFromShopify, createShopifyCart } = await import(`${HOST}/piobox-customizer/shopify-adapter.js`);
const { createVercelBlobUploader } = await import(`${HOST}/piobox-customizer/uploader.js`);

mount(host, {
  photoBase: `${HOST}/assets/photos`,
  fontBase:  `${HOST}/assets/fonts`,
  onSubmit: createShopifyCart({
    strategy: "line-items",
    ladder,
    setupVariants: { screen: <screen setup variant id>, embroidery: <digitise variant id> },
    uploadFiles: createVercelBlobUploader({ handleUploadUrl: `${HOST}/api/upload` }),
  }),
});
```

You can then delete `piobox-customizer.js`, `piobox-shopify-adapter.js` and
`piobox-customizer.css` from the theme's assets — nothing references them any more.

## Source of truth

There is **one** copy of the customizer: `piobox-customizer/` at the repo root. The Vercel
project root is the repo root, so `build.mjs` bundles the same files the deploy uploaded.
Nothing to sync, nothing that can drift.

It was not always this way, and the failure was silent, so it is worth knowing why:
`vercel-app/` used to hold a vendored copy made by a `sync.mjs` prestep. A deploy that skipped
that step uploaded the old copy and **succeeded** — no error anywhere — which is how the live
store spent a day serving a build with no margin logic in it. If you ever reintroduce a build
that copies source around, make the copy fail loudly rather than quietly.

Historically there was also a third copy in the Shopify theme's assets. The snippet now imports
from this host instead, so those theme assets are dead and can be deleted.

## Security

A storefront has no signed-in user, so `/api/upload` is reachable by anyone who can load the
shop. It is constrained by `ALLOWED_ORIGINS`, a content-type allow-list, a 30 MB cap, and
random path suffixes. Verified: a request from an unlisted origin is rejected with
`403 Origin not allowed`.

`ALLOWED_ORIGINS` currently holds `https://www.blankd.co.za`, `https://blankd.co.za` and
`https://8pj4gs-97.myshopify.com` (the last so theme previews from Shopify admin keep working).
It is read at build time, so **any change needs a redeploy to take effect**. Update it with:

```bash
npx vercel env rm ALLOWED_ORIGINS production --yes
printf 'https://a.example,https://b.example' | npx vercel env add ALLOWED_ORIGINS production
npm run deploy
```

**Uploaded artwork is currently private** — fetching a returned Blob URL without credentials
returns `403`. Production staff therefore cannot open artwork straight from an order. Decide
between a public store (simple, URLs unguessable but unauthenticated) and keeping it private
plus minting signed read URLs at order time. Unresolved.
