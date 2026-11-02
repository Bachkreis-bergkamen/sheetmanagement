---
name: Sheetmanagement
description: The player's own folder on the music stand, as a calm phone app.
colors:
  bachkreis-gold: "#e6b422"
  bachkreis-gold-deep: "#815c09"
  poster-black: "#0b0b0a"
  rehearsal-paper: "#f4f4f1"
  sheet-white: "#ffffff"
  stand-grey: "#eeede8"
  pencil-line: "#e0ded7"
  ink: "#161512"
  ink-muted: "#625e55"
  ok: "#2a7548"
  warn: "#8f5c0a"
  danger: "#b8342a"
  night-stage: "#0b0b0a"
  night-surface: "#161513"
  night-surface-raised: "#201e1b"
  night-line: "#2c2924"
  night-ink: "#f2eee4"
  night-ink-muted: "#a9a293"
  night-ok: "#4fae78"
  night-warn: "#c98a2c"
  night-danger: "#e8695c"
  night-surface-lifted: "#3a362f"
  scrim: "rgb(0 0 0 / 0.35)"
  calendar-velvet: "#8c1c2b"
  calendar-paper: "#fbf7ec"
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 1.75rem + 1.6vw, 2.875rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0em"
  headline:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 2rem + 2.4vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.07em"
rounded:
  hair: "2px"
  xs: "6px"
  s: "8px"
  control: "12px"
  m: "14px"
  l: "20px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.bachkreis-gold-deep}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-primary-touch:
    backgroundColor: "{colors.bachkreis-gold-deep}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.stand-grey}"
  button-small:
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.l}"
    padding: "24px"
  field-input:
    backgroundColor: "{colors.rehearsal-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  section-label:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
  tabbar:
    height: "64px"
---

# Design System: Sheetmanagement

## Overview

**Creative North Star: "The Stand Folder"**

Every player has a folder on the music stand: their parts, the dates, a pencilled note from the last rehearsal. The app is that folder on the phone. It's quiet and practical, and everything for *my* part is within reach of a thumb. The orchestra's colour is the tab on the folder: it marks where to look and what to press, and it isn't wallpaper. The next date, the answer and one's own part come first. Organisers' tools sit further back and use the same materials.

The density is calm, not sparse. White cards lie on a nearly neutral paper page, lists are inset with hairlines between rows, and there's one primary action per area. The poster world of the Bachkreis (black and gold, the condensed heading face, the logo large and dim behind the greeting) shows up in a few chosen places: page titles, the dark story card on the start page with the season drifting through it, and the date blocks of concerts. The rest stays out of the way.

The whole system is themeable per orchestra. Bachkreis-Gold is the Bachkreis preset's accent. Another orchestra sets its own colour, and the light and dark shades are derived from it so that text and buttons keep 4.5:1. The "plain" look swaps the condensed display face for a classic serif and drops the watermark.

**Key Characteristics:**
- One accent colour per orchestra, used sparingly for actions, the current place and concerts.
- Condensed bold display headings over a system sans for everything you read or tap.
- White cards with a hairline border and a soft, wide shadow on a warm paper-grey page. In dark mode the page is near-black.
- Pill buttons, generous radii, and touch targets of 44px on touch screens.
- Short, soft motion with one curve. Pages rise in, sections unfold, and pressed things give way slightly.
- On phones, a bottom tab bar with five places. On desktop, a top bar.

## Colors

A nearly neutral, slightly warm paper page with ink-dark text, and the orchestra's accent as the only colour that speaks.

### Primary
- **Bachkreis-Gold** (#e6b422): the orchestra's brand colour as configured (`--brand`). It's used at full strength only where it sits on dark: as the accent in dark mode, as the greeting on the black story card, and in the logo. On the light page it's too pale for text.
- **Bachkreis-Gold, deep** (#815c09): the shade derived for the light page (`--accent`), darkened just enough for 4.5:1 on paper and under white text. It's used for primary buttons, links in action rows, focus rings, the active tab, and concert date blocks.
- **Soft gold tint** (the brand mixed at 22% light / 16% dark into transparent, `--accent-soft`): the background for the current tab's pill, secondary buttons, note boxes and the demo banner.

### Neutral
- **Rehearsal Paper** (#f4f4f1): the page background in light mode. It's also the field background, so inputs read as set into the card.
- **Sheet White** (#ffffff): cards, lists and dialogs.
- **Stand Grey** (#eeede8): a second surface for tracks (segmented control), pressed rows and hover.
- **Pencil Line** (#e0ded7): borders. Hairlines are this colour at 75% strength.
- **Ink** (#161512) and **Ink, muted** (#625e55): text and secondary text. Muted text keeps 4.5:1 on the paper, on white and on the soft gold tint.
- **Night Stage** (#0b0b0a), **Night Surface** (#161513), **Night Surface, raised** (#201e1b), **Night Line** (#2c2924), **Night Ink** (#f2eee4), **Night Ink, muted** (#a9a293): the same roles in dark mode. **Night Surface, lifted** (#3a362f, `--surface-lifted`) is for a thumb or knob that must stand off its track in dark mode; in light it's Sheet White. **Scrim** (black at 35%, `--scrim`) dims the page behind dialogs, the search sheet and menus. Poster Black (#0b0b0a) is also the ink on gold buttons in dark mode and the story card's background in both modes.

### Status
- **OK** (#2a7548 / night #4fae78), **Warn** (#8f5c0a / night #c98a2c), **Danger** (#b8342a / night #e8695c): answers, missing parts and errors. Each keeps 4.5:1 as text on every surface in its scheme. Messages use them as a 10–12% tint behind normal text, not as large fills.

### Signature colours (calendar only)
- **Calendar Velvet** (#8c1c2b, with darker and lighter shades) and **Calendar Paper** (#fbf7ec): the velvet board and paper stickers of the month view. They are local to the calendar and never appear elsewhere.

### Named Rules
**The Folder Tab Rule.** The accent marks where to act or where you are: the primary button, the current tab, a concert. If a screen has more gold than that, something is decorating.

**The Derived Shade Rule.** Never put the raw brand colour on the light page as text or as a button fill. Use the derived deep shade, which `src/lib/branding.ts` computes per orchestra so it always reaches 4.5:1.

## Typography

**Display Font:** Barlow Condensed 600/700 (with Arial Narrow, then the system sans), served by the app itself. The "plain" look uses Iowan Old Style / Palatino / Georgia instead.
**Body Font:** the system UI sans (ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto).

**Character:** a narrow, loud poster face for names and titles, and the phone's own face for everything you read or tap, so the app feels at home on each device.

### Hierarchy
- **Headline** (700, clamp 2.5–3.75rem, line-height 1): the greeting on the start page's dark story card, in gold. Only there.
- **Display** (700, clamp 2.125–2.875rem, 1.2): each page's `h1` (Kalender, Notenarchiv, a piece's name).
- **Title** (600, 1.125rem, 1.2, −0.01em): section and card headings (`h2`), in the system sans.
- **Body** (400, 1rem, 1.5): all reading text. The reader's own browser size counts (`font-size: 100%`), and the text size setting on /profil scales the whole page to 112.5% or 125%.
- **Label** (650, 0.75rem, +0.07em, uppercase): small section labels above lists ("NÄCHSTE PROBE", "OKTOBER 2026").

### Named Rules
**The Two Voices Rule.** The condensed face speaks only in page titles and the story card. Buttons, lists, labels and body text always use the system sans.

**The Readable Floor Rule.** Everything is in rem so the text size setting reaches it. Nothing anyone reads is smaller than `--text-2xs` (0.75rem). The tab bar labels are the one place held at that floor (12px) at every text size, so five still fit side by side.

**The One Scale Rule.** Every font size is a token from `src/app.css`, never a literal: `--text-2xs` 0.75, `--text-xs` 0.8125, `--text-sm` 0.875, `--text-md` 0.9375, `--text-base` 1, `--text-lg` 1.125, `--text-xl` 1.25, `--text-2xl` 1.5, `--text-3xl` 2, `--text-4xl` 2.25 (rem), plus the fluid `--text-display`, `--text-headline` and `--text-date` for the condensed face. Labels and meta use 2xs–sm, body and controls md–base, card titles lg–xl, big numbers 2xl–4xl. The only exceptions are SVG text drawn in a viewBox's own units and the print programme, which is set in pt.

## Layout

A single centred column, at most 1040px wide (`--content-width`), with a 16px side gutter, 32px above the content (24px on phones) and 48px below. The spacing runs on a 4px base: 4, 8, 12, 16, 24, 32, 48. Cards pad 24px and stack 24–32px apart, and items inside a card sit 8–16px apart.

The page is built from stacked sections, each with a small uppercase label and then a card or an inset list. Two-column arrangements appear only on wide screens and collapse to one column below about 720px.

Breakpoints, as used in the code:
- **960px:** the desktop top bar drops the orchestra's full name.
- **720px:** the main menu moves into the bottom tab bar (64px plus the safe area), the top bar keeps the logo, search and account, and page tops tighten.
- **640, 560 and 480px:** components re-flow (date rows, action rows, grids).

On coarse pointers, buttons grow to 44px and gain wider padding.

## Elevation & Depth

The system is a light hybrid: a hairline border carries the shape, and a soft, wide shadow lifts cards a little off the paper. Depth means "this is a thing you can open or use", not hierarchy. The sticky top bar and the bottom tab bar are frosted glass: 78–94% of the page colour with `saturate(1.6) blur(20px)` and a hairline edge. That keeps them the same material as the page instead of a coloured band.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px rgb(0 0 0 / 0.05)`): cards and inset lists. In dark mode it's `0 1px 2px rgb(0 0 0 / 0.3), 0 4px 16px rgb(0 0 0 / 0.25)`.
- **Raised** (`box-shadow: 0 2px 6px rgb(0 0 0 / 0.06), 0 18px 48px rgb(0 0 0 / 0.12)`): dialogs, the search sheet, the tour card and menus. In dark mode it's `0 2px 6px rgb(0 0 0 / 0.4), 0 18px 48px rgb(0 0 0 / 0.5)`.

### Named Rules
**The Paper On Paper Rule.** There are only two levels: resting cards and raised overlays. Don't stack a shadowed card inside a shadowed card. Inner groups use Stand Grey or a hairline instead.

## Shapes

Generous, friendly curves throughout, from one scale of tokens and never a literal: hair (2px) for marks in charts, xs (6px) for small tags and swatches, s (8px) for focus rings, segmented-control thumbs and small chips, control (12px) for fields, answer buttons, date blocks and icon tiles, m (14px) for messages, note boxes and inner panels, and l (20px) for cards and lists. Buttons, the active tab's pill and badges are full pills (`--radius-pill`), and avatars and dots are circles (50%).

Borders are always 1px hairlines in Pencil Line, never heavy outlines. Disclosure sections use a drawn chevron (a 2px corner rotated −45° to 45°) instead of an icon font.

## Components

### Buttons
Calm, round and thumb-sized. They're quiet until touched.
- **Shape:** full pill (999px).
- **Primary:** a deep accent fill with white text (Poster Black text in dark mode), 0.875rem 600 weight, 40px tall with 16px padding. On touch screens it's 44px with 24px padding.
- **Hover / Active:** on hover, brightness goes up 6%. On press, it scales to 0.97 over 0.15s on the shared curve. The focus ring is a 2px accent outline with a 2px offset.
- **Secondary:** the soft gold tint with accent text, for the quieter action next to the primary one.
- **Ghost:** a hairline border with ink text and no fill. On hover it fills with Stand Grey.
- **Small:** 32px tall (36px on touch) with 12px padding, at 0.8125rem.
- **Text actions:** a row of quiet accent-coloured text actions ("Drucken · Bearbeiten"), at least 32px tall, underlined on hover.

### Chips and badges
- **Status chips** ("Antwort fehlt", "Als Nächstes"): small pills with a tinted status or accent background and matching text.
- **Answer buttons** (Ich komme / Vielleicht / Ich kann nicht): three equal tiles in a row, each with an icon above its label, tinted in the status colour once chosen.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** Sheet White (Night Surface in dark mode).
- **Shadow Strategy:** Resting (see Elevation & Depth).
- **Border:** a 1px hairline.
- **Internal Padding:** 24px.
- **Inset lists:** the same shell with hairlines between rows instead of padding. A pressed row turns Stand Grey at once, before the next page loads.

### Inputs / Fields
- **Style:** a 1px Pencil Line border, the control radius (12px), a Rehearsal Paper fill (set into the white card), and 9px × 12px padding at 0.9375rem. The label sits above in 0.8125rem 600 muted text.
- **Focus:** a 2px accent outline with a 1px offset. Search boxes move the ring to their wrapper (`:focus-within`).
- **Messages:** OK and error messages are rounded 14px bands with a 10–12% status tint. Info messages use a dashed hairline with muted text.

### Navigation
- **Top bar (all sizes):** sticky, 60px, frosted, with the logo, the orchestra's name, search and account. On desktop the main menu sits here too.
- **Tab bar (below 720px):** fixed to the bottom, 64px plus the safe area, frosted, with five places (Übersicht, Meine Noten, Kalender, Archiv, Mehr). Each place is an icon over a short label. The current place's icon sits on a soft gold pill that grows in from half width, and its label turns 650 weight.
- **Segmented control:** a Stand Grey track with a white thumb that slides under the active option (a lifted tone in dark mode).

### Date block (signature)
A 52px column with the weekday, day number and month stacked in a block with the control radius (12px), tinted with the event type's tone. Concerts get the full accent fill with contrast text. It's the app's most repeated mark: every list of dates starts with it.

### Story card (signature)
The start page's greeting is always on Poster Black, in both schemes, with a hairline edge so it holds its shape on the dark page. The greeting is in the brand colour at full strength, with no eyebrow above it, and the orchestra's logo sits large and dim (20% opacity) behind it, bleeding off the right edge. The season's scene drifts between the greeting and the logo (see Season marks). It's the one place the poster speaks loudly. On phones it stays short so the next date is still on the first screen.

### Season marks (signature)
Small line drawings for the time of year, drawn on a 24 grid with round strokes like pencil marks in the margin: stars and a candle in Advent, a burst and a sparkling glass at New Year, snow and a waving snowman in winter, blossoms and a butterfly in spring, a sun and a sailing boat in summer, leaves and a kite in autumn, and a flapping bat at Halloween. They appear in two places only:
- **Scene:** behind the story card's greeting, in the brand colour at 60% opacity, the motifs drifting, falling or twinkling in slow linear loops and the companion moving one part (wings, an arm, a flame). On a wide card they're drawn 1.6× larger and kept between the greeting and the logo, never on top of it.
- **Pair:** one motif and its companion at 22px in the footer, in the accent at 45%, hopping in once on the shared curve and moving a few times before they rest.

With reduced motion everything stands still, and snow lies where it would have fallen. The marks never carry meaning and never appear on working pages.

### Answer dock (signature)
On phones the start page reads at the top and acts at the bottom. The next date's question ("Bist du am Samstag dabei?"), its three answer buttons and a full-width "Meine Noten · <instrument>" button sit in a frosted dock fixed right above the tab bar, in thumb reach. Once answered, it shrinks to one line, and the whole band takes the answer's colour (green, amber or red, at about 15% over the page), with "ändern" on the right. When the next date's card scrolls out of view, the dock slides away, because its answers belong to that date. Toasts rise above it (`--dock-height`). On desktop the same controls sit inside the card. Later dates never get their own answer buttons on the start page, only an answer line that links to the date.

### Calendar month (signature)
The month view is a velvet board with paper stickers for rehearsals, the Generalprobe and concerts, each carrying the logo. It's the app's one skeuomorphic moment and stays inside the calendar.

## Do's and Don'ts

### Do:
- **Do** build every page from the tokens in `src/app.css`. A theme is one block there, and another orchestra's accent must flow through untouched.
- **Do** use the derived deep accent (`--accent`) for text and fills on light pages, and keep `--brand` for dark backgrounds.
- **Do** give every tappable thing at least 44px on touch screens (`--tap`), and 32px minimum for text actions.
- **Do** put the next date, the answer and the member's own part on the first phone screen before anything else.
- **Do** use the one motion curve (`cubic-bezier(0.2, 0.8, 0.2, 1)`) at 0.15s for state changes and about 0.25s for page and section transitions.
- **Do** check both schemes and the 125% text size before calling a screen done.

### Don't:
- **Don't** use the condensed display face for buttons, labels or body text.
- **Don't** put the raw brand colour as text on the light page, or hard-code Bachkreis-Gold outside the preset.
- **Don't** add thick one-sided colour stripes to cards or chips. Use a tint, a full hairline or a small dot to mark a type.
- **Don't** set readable text below 0.75rem, or in px where it should follow the text size setting.
- **Don't** nest a shadowed card inside a shadowed card.
- **Don't** use bouncy or elastic easing. Every transition, the segmented control's thumb included, runs on the one curve. The only looping motion is the season's scene, and it stops with reduced motion.
- **Don't** write a colour, size or radius as a literal in a component. Use the tokens in `src/app.css`; the tuner and metronome drawings, which paint their own wood, brass and dial, are the only exception.
