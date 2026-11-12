# Contributing

Thanks for helping. Sheetmanagement is run by volunteers for volunteer orchestras, so the main rule is: **keep it lightweight**. No new runtime dependency without a very good reason, and nothing that costs money to run.

## Getting set up

```bash
pnpm install
pnpm dev:demo                    # German, sample data, no Google account
APP_LANGUAGE=en pnpm dev:demo    # the same in English
```

To work against real Google data, copy `.dev.vars.example` to `.dev.vars` and follow [docs/setup-google.md](docs/setup-google.md).

## Before you open a pull request

```bash
pnpm check     # types
pnpm test      # unit tests
pnpm test:e2e  # end-to-end tests against the demo (once: pnpm exec playwright install chromium)
```

CI runs all three plus an accessibility check (axe) on desktop and phone sizes; a pull request can only be merged when they pass.

- **One topic per pull request**, with a short description of what changes for the people using the app.
- **Both languages:** every text lives in `src/lib/i18n/de.ts` and `en.ts`; the type checker complains when one is missing.
- **Phone first:** most members use the app on a phone at rehearsal. Check your change at phone width and in dark mode.
- **Design:** read [DESIGN.md](DESIGN.md) and use the tokens in `src/app.css` rather than new colours or sizes.
- **No deployment data in the repo:** ids, keys and member data belong in Cloudflare secrets or the Google Sheet.
- **UI changes:** add before/after screenshots. `node scripts/screenshots.mjs` refreshes the ones in `docs/screenshots/` (see the comment at the top of the script).

## Reporting bugs and ideas

Use the [issue templates](https://github.com/Bachkreis-bergkamen/sheetmanagement/issues/new/choose). The [Roadmap issue](https://github.com/Bachkreis-bergkamen/sheetmanagement/issues/73) shows what's planned. Security problems go privately; see [SECURITY.md](SECURITY.md).

## Code of conduct

Be kind and patient; many people here are musicians first and programmers second. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
