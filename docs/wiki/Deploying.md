# Deploying

Running Sheetmanagement costs nothing: Cloudflare's free plan and Google's free APIs are enough for an orchestra.

## 1. Deploy the app

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. `pnpm wrangler login`
3. `pnpm run deploy` (`run` is needed: `pnpm deploy` is a built-in pnpm command). The app is then live at `https://noten.<your-account>.workers.dev`. Change `name` in `wrangler.toml` for another subdomain.

For the English interface: `APP_LANGUAGE=en pnpm run deploy`, or `APP_LANGUAGE=en` in a `.env` file. Pick the language before the first deploy; see [[Configuration]].

## 2. Connect Google

Follow [docs/setup-google.md](https://github.com/lgreil/sheetmanagement/blob/main/docs/setup-google.md) (about 15 minutes, free): a service account for Drive, Calendar and Sheets, and Google sign-in. Values are stored as Cloudflare secrets, e.g. `pnpm wrangler secret put ORCHESTRA_NAME`. All of them are listed in [`.dev.vars.example`](https://github.com/lgreil/sheetmanagement/blob/main/.dev.vars.example).

## 3. Check and prepare

Open `/einstellungen/status` on your deployment to check every connection, then `/einstellungen/tabelle` to prepare the Repertoire sheet.

## Your own domain (optional)

The app runs fine on `workers.dev`. To move it to an address like `noten.example.org`:

1. Add the domain to the same Cloudflare account as the Worker (its nameservers point to Cloudflare).
2. Workers & Pages → the Worker → **Settings → Domains & Routes → Add → Custom domain**: `noten.example.org`. Cloudflare creates the DNS record and the certificate.
3. `pnpm wrangler secret put APP_URL` with `https://noten.example.org`. The `workers.dev` address then redirects there (308, path and query kept), so old bookmarks and calendar subscriptions keep working.
4. Google Cloud → the OAuth client: add `https://noten.example.org/auth/callback` under **Authorized redirect URIs** (keep the old one until everyone has moved).
5. If email is connected, connect it again on `/einstellungen/status` from the new address: links in emails use the address it was connected from.
6. Update the GitHub variable `APP_URL`.

Members sign in once more, and anyone who installed the app or turned on notifications does that again on the new address: browsers keep both per address.

## What gets created on Cloudflare

| Binding | What | Notes |
|---|---|---|
| `CACHE` (KV) | Cache of the archive index | Created on the first deploy; Wrangler may write its id into `wrangler.toml`, it's not secret |
| `SHEET_LOCK` (Durable Object) | Lets saves to the sheet take turns | Stores nothing; added to the worker by `scripts/wrap-worker.mjs` |
| `DB` (D1) | Push subscriptions, which reminders went out | See below |

To keep the database in the EU, create it before the first deploy with `pnpm wrangler d1 create noten --jurisdiction eu` and put its `database_id` into `wrangler.toml`. Its tables are in `migrations/`. D1 keeps 30 days of history ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)): `pnpm wrangler d1 time-travel restore noten --timestamp=…` goes back to any minute in that time. With `DRIVE_BACKUP_FOLDER_ID` set, a weekly JSON copy of all data also goes to a Drive folder, outside Cloudflare (see the setup guide, step 9).

## Reminders and background jobs

Web Push needs a key pair: `node scripts/vapid-keys.mjs`, then `pnpm wrangler secret put VAPID_PUBLIC_KEY` and `… VAPID_PRIVATE_KEY`. Members turn notifications on per device under **Profile**.

A Cron Trigger (every 10 minutes) runs whatever is due: filling caches, reminders about unanswered rehearsals and rented music that's due, a daily check of the Google connection that notifies admins when it breaks, the check for missing or short parts, and, if a retention period is set, removing names from old sign-ups and attendance. `/einstellungen/status` shows when each last ran.

## Email (optional)

An admin connects the orchestra's Google account on `/einstellungen/status` (Gmail, scope `gmail.send` only). Members without a Google account then get a sign-in link by email, and members without notifications get their reminders by email, with one-click answers. See "Email" in [docs/setup-google.md](https://github.com/lgreil/sheetmanagement/blob/main/docs/setup-google.md#email).

## Automatic deploys from GitHub

Every merge into `main` can deploy by itself (`.github/workflows/deploy.yml`): type-check, test, build, deploy, apply the database schema, run a smoke test against the live site, then deploy the public demo. It can also be started by hand under **Actions → Deploy → Run workflow**.

In the repository settings it needs:

- Secret `CLOUDFLARE_API_TOKEN`: a token from the template **Edit Cloudflare Workers** with **D1: Edit** added.
- Secret `CLOUDFLARE_ACCOUNT_ID`: shown by `pnpm wrangler whoami`.
- Variable `APP_URL`: e.g. `https://noten.<your-account>.workers.dev`.
- Variable `DEMO_URL` (optional): e.g. `https://noten-demo.<your-account>.workers.dev`, for the demo's smoke test.

The app's own settings stay Cloudflare secrets; the workflow doesn't touch them. Don't want a public demo? Delete the `demo` job.

## Checks on pull requests

`.github/workflows/ci.yml` runs `pnpm check`, `pnpm test` and `pnpm build`, and the end-to-end tests: Playwright opens the demo on a desktop and a phone size, goes through the main pages and the weekly flows and checks each page with axe for accessibility problems. Dependabot opens grouped update PRs every Monday.

## On Windows

Stop a running `pnpm preview` or `pnpm dev` before building again: the running Worker locks the build folder.
