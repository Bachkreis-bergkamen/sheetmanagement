# Configuration

## On the settings page (no code)

Name, logo, accent colour, the look (*bold*: condensed headings and the logo behind the greeting; or *plain*) and the features in use can be changed by an admin on **/einstellungen**. They're saved in the sheet's "Einstellungen" tab and win over the variables below, which win over the preset; an empty field falls back.

## Variables

Set with `pnpm wrangler secret put <NAME>`, or in `.dev.vars` locally. The full list is in [`.dev.vars.example`](https://github.com/lgreil/sheetmanagement/blob/main/.dev.vars.example).

| Variable | What |
|---|---|
| `ORCHESTRA_NAME`, `ORCHESTRA_SHORT_NAME` | The orchestra's name |
| `ORCHESTRA_ACCENT` | Accent colour `#rrggbb`; shades for light and dark are derived so text stays readable, `/einstellungen/status` shows their contrast |
| `ORCHESTRA_LOGO` | A file in `static/` or an https link; replaces `static/logo.png` |
| `ORCHESTRA_LINKS` | Footer links: `"Website https://…; Instagram https://…"` |
| `FEATURES_OFF` | Features not used, e.g. `"leihmaterial, gema"` |

## Features that can be turned off

Rented music, the GEMA list, attendance, sign-ups, wishes, the calendar feed, saving parts offline and the seasonal drawings: with `features` in the preset or `FEATURES_OFF`. Their pages, menu entries and sheet tabs go away.

## Presets: instruments, file names, calendar keywords

Everything else orchestra-specific lives in [`src/lib/config/`](https://github.com/lgreil/sheetmanagement/tree/main/src/lib/config):

- **Instruments:** names, display order, alternative spellings
- **Naming rules:** how part files are named (separator, status words like `FEHLT`, the `@` prefix for scores)
- **Event keywords:** which calendar titles count as concert, rehearsal or dress rehearsal

Copy `presets/bachkreis.ts`, adjust it, and select your preset in `config/index.ts`.

## Language

German by default; English with `APP_LANGUAGE=en` when building. One language per deployment: the texts are in `src/lib/i18n/de.ts` and `en.ts`, and the type checker makes sure both have every text. A new English deployment also gets English tab and column names in its sheet; an existing sheet keeps its names, so **don't switch the language of a deployment that already has one**. Instrument names come from the preset and can be renamed on /einstellungen.

## Optional sheet tabs

"Hinweise" (notes on pieces) and "Probennotizen" (notes after a rehearsal) are created by the first note, or by /einstellungen/tabelle with dropdowns. "Stimmenzuteilung" (who plays which part instead of their own: Wer is a member's e-mail or an instrument, Spielt the part, Stück and Konzert empty for every piece and always) is created by the first assignment on a piece's page. "Komponist (voll)" in "Stücke" holds the full composer name for the GEMA list; "Online nachschlagen" on a piece's edit page fills it from Wikidata.
