# The demo

**Online:** https://noten-demo.bachkreis.workers.dev (English). Nothing to install, no account.

**On your computer:**

```bash
pnpm install
pnpm dev:demo                    # German
APP_LANGUAGE=en pnpm dev:demo    # English
```

Then open http://localhost:5173.

The demo needs no Google account and no settings. It uses invented sample data: the "Musterorchester" with a small library of generated PDFs, rehearsals and concerts around today, and a filled-in Repertoire sheet with members, a rehearsal plan, sign-ups, attendance, rented music, piece durations, reports and wishes. You're signed in automatically. The banner at the top switches between the **admin's** and a **member's** view, and **Reset** brings the sample data back.

Everything works, including the editors, but changes stay in memory: they're gone after a restart. Nothing is sent to Google.

## Notes

- The settings come from `[env.demo]` in `wrangler.toml`. If you also have a `.dev.vars` with real settings, create an empty `.dev.vars.demo`; otherwise Wrangler loads `.dev.vars` for the demo too.
- The public demo is a separate Worker (`noten-demo`) that needs no secrets: `APP_LANGUAGE=en CLOUDFLARE_ENV=demo pnpm build && pnpm wrangler deploy` (the environment is picked when building). The deploy workflow does this after every merge into `main`.
- On Cloudflare each Worker instance keeps its own copy of the data, so visitors may see each other's changes for a while, or not.
- The end-to-end tests (`pnpm test:e2e`) run against the demo too.
