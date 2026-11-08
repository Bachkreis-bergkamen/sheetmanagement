# Page audit, 8 November 2026

Step 1 of #185: every page, what it's for, who uses it and how it's reached. This was taken after #285–#287 (member places, the Verwaltung area, one settings page, Zu erledigen). The **Views** column fills in once page counting (`/api/seitenaufruf`, D1 table `page_counts`) has run for 30 days. It reads from the Status section of the settings ("Seitenaufrufe (30 Tage)"). The counts hold the route and the role only, never the person.

Roles: **M** every member · **O** organisers with the right named · **A** admins (`mitglieder.verwalten`) · **public** without sign-in.

## Members' places

| Route | What it's for | Who | Reached from | Views (30 d) |
|---|---|---|---|---|
| `/` | Next date with answer buttons, "Meine Noten" button, what's waiting, later dates | M | Tab bar | – |
| `/meine-noten` | Your parts for the next concert, offline copies | M | Tab bar, start page dock | – |
| `/kalender` | Rehearsals and concerts, list or month | M | Tab bar | – |
| `/kalender/[id]` | One date: answer, place, programme, rehearsal notes; for O also the who-comes list | M | Calendar, start page | – |
| `/profil` | Instruments, notifications, calendar link, view and text size, data download, tour | M | Tab bar (members), avatar | – |
| `/stuecke` | The archive: every piece with its parts | M | Mehr, search | – |
| `/stuecke/[id]` | One piece: your part on top, all parts, recordings, notes, seating | M | Archive, programme, search | – |
| `/ueben/[id]` | Practice view of one part, with tools and marks | M | Piece page, Meine Noten | – |
| `/chronik` | Every concert since the start, in numbers | M | Mehr | – |
| `/wuensche` | Suggest pieces and ideas, +1 | M | Mehr | – |
| `/termine`, `/termine/[id]` | Date polls | M in the poll's groups; O `termine.planen` creates | Mehr, Zu erledigen | – |
| `/kummerkasten`, `/kummerkasten/[id]` | Anonymous messages to the Leitung, and its inbox | M; inbox for the Leitung | Mehr | – |
| `/zu-erledigen` | Everything waiting for you, one row each | M (what they may act on) | Start page row, Verwaltung | – |
| `/install` | Install guide for the home screen | M | Profile, tour | – |

## Organisers' area (Verwaltung)

| Route | What it's for | Who | Reached from | Views (30 d) |
|---|---|---|---|---|
| `/verwaltung` | Hub: Zu erledigen, then every organiser page by group | O | Tab bar (organisers) | – |
| `/meldungen` | Reported problems with parts | O `stuecke.bearbeiten` | Verwaltung, Zu erledigen | – |
| `/fehlende-stimmen` | Gaps in the archive, scan jobs | O `stuecke.bearbeiten` | Verwaltung, Zu erledigen | – |
| `/stuecke/angaben` | Fill in missing piece details | O `stuecke.bearbeiten` | Verwaltung | – |
| `/namen` | Bring file names into the convention | O `stuecke.bearbeiten` | Verwaltung | – |
| `/leihmaterial` | Rented music and when it's due | O `stuecke.bearbeiten` | Verwaltung, Zu erledigen | – |
| `/ensembles` | Choirs and orchestras we perform with | O `programme.bearbeiten` | Verwaltung | – |
| `/admin` | Members, groups, rights, invitations, access requests | A | Verwaltung, Zu erledigen | – |
| `/einstellungen` | Settings: Orchester section (name, logo, colour, look, features, privacy, instruments) | A | Verwaltung | – |
| `/einstellungen/tabelle` (+ `/datenbank`) | Settings: sheet set-up and the data move | A, everyone while sign-in is off | Settings sections | – |
| `/einstellungen/status` | Settings: connections, jobs, error log, page views | A, everyone while sign-in is off | Settings sections, notifications | – |

## Pages under a date or piece (organisers)

| Route | What it's for | Who | Views (30 d) |
|---|---|---|---|
| `/kalender/[id]/programm` | Edit a concert's programme | O `programme.bearbeiten` | – |
| `/kalender/[id]/probenplan` | Rehearsal plan for a concert | O `programme.bearbeiten` | – |
| `/kalender/[id]/drucken` | Print the programme and the GEMA list | O `programme.bearbeiten` | – |
| `/kalender/[id]/anwesenheit` | Take attendance | O `anwesenheit.erfassen` | – |
| `/kalender/[id]/karten` | Ticket sales and Freikarten | O | – |
| `/kalender/[id]/stimmensatz` | Part set for a concert | O `stuecke.bearbeiten` | – |
| `/stuecke/[id]/bearbeiten` | Edit a piece | O `stuecke.bearbeiten` | – |
| `/stuecke/[id]/stimmensatz` | Part set for a piece | O `stuecke.bearbeiten` | – |
| `/chronik/saison` | Season report for the annual meeting | A | – |
| `/einlass/[concert]` | Check-in at the door | O `karten.einlass` | – |

## Outside the app's navigation

| Route | What it's for | Who |
|---|---|---|
| `/anmelden`, `/auth/*`, `/zugang` | Sign-in, links, passwords, invitations, access request | public |
| `/antwort/[token]` | One-click answers from emails | public with the link |
| `/karte/[order]` | A ticket buyer's ticket | public with the link |
| `/datenschutz`, `/nutzungsbedingungen` | Legal pages | public |

## Against the goals of #185

| Goal | Now | Note |
|---|---|---|
| Parts for the next rehearsal in ≤ 2 taps | **1 tap**: "Meine Noten · instrument" in the start page dock | #214, #216 |
| Answer the next date in ≤ 2 taps | **1 tap**: answer buttons in the dock | #214, #215 |
| The start page leads with one thing | The next date first; open work is one row below it | #220, #221 |
| Members' navigation | 4 places + Mehr; Mehr has Archiv, Chronik, Wünsche, Terminumfragen, Kummerkasten | #285 |
| Organisers' work apart | One "Verwaltung" place; it's no longer in Mehr | #285 |
| Every admin setting in one place | `/einstellungen` with Orchester · Tabelle & Daten · Status | #286 |
| Overlapping to-do pages merged | `/zu-erledigen` lists all of it; Meldungen and Fehlende Stimmen stay as the place the work is done | #287 |
| No page with more than one primary button | **Open.** Pages with the most filled buttons: `/profil` (7), `/admin` (7), `/kalender/[id]/programm`, `/kalender/[id]/karten`, `/einstellungen/status` (3 each). This is a rough count of `.btn` without `ghost`/`secondary`, and some sit in separate sections. | next step |
| Forms show 2–3 fields, the rest under "Weitere Angaben" | **Open.** Candidates: `/stuecke/[id]/bearbeiten`, the date form, `/admin` (add member) | next step |
| Fewer top-level pages than before | Menu entries for an admin: **18 → 9** in Mehr (organiser pages moved behind one entry); top-level settings pages **3 → 1** | |

## What the counts should answer
Once 30 days of counts are in:
1. Which "Mehr" pages members actually open. A page members almost never open is a candidate for moving into another page.
2. Whether the archive is used enough by members to earn back a tab.
3. Which organiser pages are rare: those go furthest down in the Verwaltung hub.
