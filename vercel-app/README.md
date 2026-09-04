# Piobox Customizer — Vercel host

Serves the customizer (ES modules, fonts, photos) **and** handles design-file uploads. Hosting
here removes three problems at once: no bundling into theme assets, fonts actually load, and
artwork bypasses Shopify's inability to carry files on a cart line.

## Deploy

Live at **https://piobox-customizer.vercel.app**.

```bash
cd vercel-app
npm run deploy
```

> **Always `npm run deploy`, never a bare `npx vercel --prod`.**
> The customizer source lives one level up; `predeploy` copies it in (`sync.mjs`) before the
> upload. A bare `npx vercel --prod` skips that step and silently ships whatever was vendored
> last time — the deploy succeeds and the stale build goes live. See "Source of truth" below.

Check it: `curl https://piobox-customizer.vercel.app/api/health`.

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

The customizer source lives at `../piobox-customizer`. `sync.mjs` vendors a **copy** into this
folder so `vercel` can upload a self-contained project, because the CLI only uploads files at
or below its own root.

That copy is the one real footgun left here: nothing can detect from inside the Vercel build
that the parent source has moved on, so a bare `npx vercel --prod` ships stale code without any
error. `npm run deploy` is the only safe command.

There is also a **third** copy in the Shopify theme (`assets/piobox-customizer.js` et al). As
long as the theme snippet imports via `asset_url`, that copy — not this one — is what customers
run. Repointing the snippet at this host (see above) collapses three copies down to two.

## Security

A storefront has no signed-in user, so `/api/upload` is reachable by anyone who can load the
shop. It is constrained by `ALLOWED_ORIGINS` (currently `https://8pj4gs-97.myshopify.com`), a
content-type allow-list, a 30 MB cap, and random path suffixes. Verified: a request from an
unlisted origin is rejected with `403 Origin not allowed`.

**Uploaded artwork is currently private** — fetching a returned Blob URL without credentials
returns `403`. Production staff therefore cannot open artwork straight from an order. Decide
between a public store (simple, URLs unguessable but unauthenticated) and keeping it private
plus minting signed read URLs at order time. Unresolved.
