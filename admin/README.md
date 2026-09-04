# Piobox Customizer — Shopify admin app

An embedded Shopify app: it appears in the Shopify admin sidebar and uses Shopify's own login.
Phase 1 shows every order that came through the design studio with its mockups, artwork,
preflight verdicts, size run and checkout price — read from the design record the studio writes
at checkout (`designs/<id>/design.json` in the private Blob store) and joined to the order by
the `_pc_design_id` line-item property.

Files are never public. The app signs a 15-minute read link for each one when the page loads.

## One-time setup

These need your logins, so they are yours to run. In order:

1. **Register the app with Shopify** (Partners login):
   ```bash
   cd admin && npm run config:link
   ```
   Create a new app called "Piobox Customizer" (or choose it if it exists). Then
   `npm run dev`, pick the BLANKD store as the development store, and open the URL it prints —
   that installs the app on the store and opens it. It will error on the database until step 3;
   that is expected.

2. **Vercel project** — already created and linked: `piobox-customizer-admin`
   (`admin/.vercel/project.json`). `SCOPES` and `SHOPIFY_APP_URL` are already set on it.

3. **Database** — Vercel dashboard → the new project → **Storage → Create → Neon (Postgres)** →
   connect to the project. That sets `DATABASE_URL`. Sessions live here.

4. **Files** — Vercel dashboard → **Storage** → the existing Blob store (the one the studio uses)
   → **Connect Project** → `piobox-customizer-admin`. The app then reads design files with OIDC;
   nothing to paste.

5. **Shopify credentials on Vercel** — from Partners → the app → *Client credentials*
   (the other two variables are already set):
   ```bash
   printf '<client id>'     | npx vercel env add SHOPIFY_API_KEY production
   printf '<client secret>' | npx vercel env add SHOPIFY_API_SECRET production
   ```

6. **Deploy, then point Shopify at it:**
   ```bash
   npx vercel --prod
   ```
   Put the same URL into `application_url` in `shopify.app.toml`, and add
   `https://piobox-customizer-admin.vercel.app/auth/callback` to `[auth] redirect_urls`, then:
   ```bash
   npm run deploy
   ```
   That pushes the URL, scopes and webhooks to Shopify. Open the app from the Shopify admin sidebar.

For local development after linking: `npx vercel env pull .env` gives you `DATABASE_URL`, then
`npm run dev`.

## Day to day

- Code change: `npx vercel --prod` from `admin/`.
- Scope, webhook or URL change: edit `shopify.app.toml`, then `npm run deploy`.
- `npm run build` runs `prisma db push` first, so schema changes apply on deploy. It fails loudly if
  `DATABASE_URL` is missing rather than shipping an app that cannot log anyone in.
