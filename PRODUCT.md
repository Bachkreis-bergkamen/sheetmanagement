# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: orchestra members on their phones.** Players of all ages, many of them older and not tech-minded. They use the app at rehearsal or on the way there: to see the next date, answer whether they're coming, and open or practise their own part. Design decisions favour them first.
- **Second: organisers on a laptop.** Notenwart, Vorstand and whoever plans programmes. They look after the archive, programmes, sign-ups, rehearsal plans, attendance, rented music and the GEMA list.

## Product Purpose

The sheet music archive, rehearsals, concerts and programmes of an orchestra in one place, so members always know what's next and have their part at hand. Success means a member can open the app, see the next date, answer and find their part within seconds, on a phone, even in a hall without reception.

## Positioning

- **Free to run:** open source (MIT), running on Cloudflare's and Google's free tiers, with no paid services and no domain. Running costs are €0. (Bachkreis's own deployment runs on Workers Paid, $5 a month, for headroom; every feature still has to work on the free plan.)
- **Reusable by other orchestras:** Bachkreis is one preset. The name, logo, accent colour, wording and features come from configuration (`src/lib/config/`).
- **Works offline at rehearsal:** an installable web app. Pages a member opened and the parts they saved stay available without reception.

## Operating Context

- The orchestra's real tools stay the source of truth. Google Drive holds one folder per piece and one PDF per part, under a fixed naming convention. Google Calendar holds rehearsals and concerts. A Google Sheet ("Repertoire") holds what Drive and Calendar can't: programmes, members, rights, sign-ups and notes.
- Drive and Calendar must keep working on their own. Many members never open the app, and nothing the app needs may make those tools worse.
- Members sign in with Google or by email link. The rights come from groups (roles) that admins manage.
- The app is used in rehearsal rooms (often with poor reception), at home while practising, and on organisers' laptops for planning and printing (concert programmes, season reports, attendance lists).

## Capabilities and Constraints

- **Features:** the archive with parts and missing-part reports; "Meine Noten" (a member's own parts per concert or rehearsal); the calendar with answers to dates; programmes; rehearsal plans; attendance; rented music; the GEMA list; wishes; notes on pieces and after rehearsals; the Chronik with a season report; practice tools (score viewer with markings, tuner, metronome); push notifications; a personal calendar feed; and a download of one's own data.
- **Language:** German first. An English translation exists (`src/lib/i18n/`). The terminology follows the orchestra: Probe, Generalprobe, Stimme, Stück, Notenarchiv, Hörbeispiel.
- **Stack:** SvelteKit on Cloudflare Workers, plain CSS, and no runtime dependencies besides SvelteKit. Google APIs are called with plain `fetch`. On the free plan each request has a limit of 10 ms CPU, so heavy work (merging PDFs, rendering scores) runs in the browser. Workers Paid allows far more, but the code is written for the free plan.
- **Demo mode** (`pnpm dev:demo`) uses invented sample data. Changes in it stay in memory only.

## Brand Commitments

- Each orchestra's name, logo and accent colour come from its configuration. The app adapts to them and must not hard-code one orchestra's identity outside its preset.

## Evidence on Hand

- The demo's sample data is invented. There are no testimonials, user numbers or quotes from orchestras, and future work must not make any up.
- Real data (pieces, members, dates) lives in the orchestra's Google account and never goes into the repository.

## Product Principles

1. **The member on the phone comes first.** The next date, the answer and their own part come before anything for organisers.
2. **Add to the orchestra's tools, never replace them.** Drive, Calendar and the Sheet stay readable and usable without the app.
3. **Nothing costs money.** No feature may need a paid service, a paid tier or a custom domain. A deployment may pay for headroom (Bachkreis runs on Workers Paid), but the free plan stays the target.
4. **Rehearsal halls have no reception.** Anything a member needs at rehearsal must work offline.
5. **One app for many orchestras.** Anything specific to one orchestra goes into configuration, not code.

## Accessibility & Inclusion

- **Standard:** WCAG 2.2 AA everywhere.
- **Older members, with extra care:**
  - Text stays readable without zooming.
  - The text size setting on /profil reaches everything on the page.
  - Touch targets are generous, at least 44px where possible.
  - Light and dark mode both meet the contrast requirements.
- **Checks:** the end-to-end tests run axe (`e2e/demo.ts`).
