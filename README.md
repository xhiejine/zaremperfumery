# Zaremperfumery – Cloudflare Worker + D1 + static site
public/   index.html, style.css, app.js (storefront), admin.html (dashboard), 404.html, img/
src/worker.js   API (products, orders, Paystack, accounts, enquiries, admin)
schema.sql / seed.sql   database
## Deploy (free Cloudflare account, Node.js installed)
1. npm install -g wrangler   then   wrangler login
2. wrangler d1 create zarem-db   -> copy database_id into wrangler.toml
3. wrangler d1 execute zarem-db --remote --file=schema.sql
4. wrangler d1 execute zarem-db --remote --file=seed.sql
5. wrangler secret put ADMIN_PASSWORD        (long, unique password)
6. Optional card payments: wrangler secret put PAYSTACK_SECRET_KEY   (use sk_test_ first)
   In Paystack dashboard > Settings > API, set webhook URL to https://YOUR-SITE/api/paystack/webhook
7. wrangler deploy
8. Open https://YOUR-SITE/admin.html, log in, enter prices and stock, set bank details in Settings.
Custom domain: Cloudflare dashboard > Workers & Pages > zaremperfumery > Settings > Domains & Routes.
## Admin image uploads (optional, uses R2)
Cloudflare dashboard > R2 > create bucket "zarem-images", then uncomment the [[r2_buckets]] block in wrangler.toml and redeploy.
Without R2, put image files in public/img and enter /img/yourfile.jpg as the Image URL.

## Image uploads (R2) and staff accounts
- Create the R2 bucket first: dashboard > Storage & Databases > R2 > Create bucket, name it zarem-images (wrangler.toml already binds it as IMAGES). Without it, wrangler deploy will fail.
- Already deployed the earlier version? Run once: wrangler d1 execute zarem-db --remote --file=migration.sql
- Owner login: leave email blank, use ADMIN_PASSWORD. Owner > Staff tab: add staff and tick what each can access.
- Admin login locks for 15 minutes after 5 wrong attempts.

## Deploying on Cloudflare PAGES (GitHub)
Build command: leave blank | Build output directory: public | Framework preset: None.
functions/api/[[path]].js runs the API. Bindings (DB, IMAGES) come from wrangler.toml; put your D1 id in it.
Add secrets in Pages > Settings > Variables and Secrets (ADMIN_PASSWORD, optional PAYSTACK_SECRET_KEY), then redeploy.
(wrangler-workers.toml.txt is the config for deploying as a Worker instead.)
