# Features

Each feature an orchestra doesn't use can be turned off; see [[Configuration]].

## For members

**Overview.** The next rehearsal with what's rehearsed and the notes from the last one, the next concert with its programme, and whatever is waiting for an answer.

**My parts.** Each member's own parts, in programme order, for the next concert or any rehearsal. *Concert mode* shows them one after another full screen, *As one PDF* puts them in one file, *Save offline* keeps them for halls without reception. Notes for the member's section or instrument show next to the part.

<img src="https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/phone-my-parts.png" width="300" alt="My parts on a phone">

**Calendar and sign-ups.** Rehearsals and concerts from Google Calendar. "I'm coming", "Maybe" or "I can't" in one tap, with a +1 for concerts. Reminders about unanswered dates by push notification or email.

**Practice.** A metronome, a tuner and a drone next to the part.

**Personal calendar feed.** A private `.ics` link on the profile page with the orchestra's dates, the member's own answer and what's rehearsed; it can be renewed or revoked.

**My data.** Every member can download what the sheet keeps about them as JSON (GDPR Art. 15).

## For organisers

**Library.** The Drive archive as a searchable list. One page per piece with all parts, duration, publisher, composer portrait, rented music and notes. A background check flags parts that are missing, empty or much shorter than the others (*Missing parts*); it never renames a file by itself. The librarian gives gaps a priority and someone to scan them, one part or a whole piece at once; that person gets a push notification and sees them under *Waiting for you*.

![A piece](https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/piece.png)

**Programmes and rehearsal plans.** Which pieces are played at which concert and rehearsed at which rehearsal.

![A concert](https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/concert.png)

**Notes from rehearsals.** On a piece: cuts, repeats and bowings agreed in rehearsal, for one section or instrument and one concert. After a rehearsal: what was rehearsed, what to practise, what comes next. Members see them where they need them.

**Attendance**, **rented music** with due dates and reminders, the **GEMA list** (German performing-rights reporting) with full composer names from Wikidata, **wishes** for pieces and **reports** of problems with parts.

**History.** Every past concert by decade with its programme; first performances marked; most played pieces and composers; pieces not played for ten years or never. A printable **season report** for the annual meeting.

![History](https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/history.png)

**Status page.** `/status` checks every connection (Drive, Calendar, Sheets, Gmail, push), shows when each background job last ran and can start one by hand.

![Status](https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/status.png)

## Under the hood

- SvelteKit on Cloudflare Workers; Google APIs called with plain `fetch`
- Light and dark mode, the orchestra's own accent colour, WCAG AA checked in CI
- German or English, one language per deployment
- Installable as an app; a service worker keeps pages and parts offline
