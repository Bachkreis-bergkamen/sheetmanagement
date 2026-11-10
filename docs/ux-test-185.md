# Test with real people, before and after (#185)

Step 5 of #185: 3 members and 1 admin, 3 tasks each, on their own phone, once on the old structure and once on the new one. What counts is **wrong taps** (a tap on something that isn't on the way to the goal) and **where people get stuck**. Time is noted but matters less.

## Setting up

- **Before:** the structure until 8 November 2026 (commit `9345260`, before #285). Run the demo from it on a laptop in the same network, or deploy it as a preview:
  ```bash
  git worktree add ../noten-vorher 9345260
  ```
  ```bash
  pnpm -C ../noten-vorher install
  ```
  ```bash
  pnpm -C ../noten-vorher dev:demo --host
  ```
- **After:** the live app, or the demo of `main`.
- Use the demo data both times, so nobody's real answers change. The demo's banner switches between "Mitglied" and "Verwaltung".
- Half the people start with "before", half with "after", so learning doesn't favour one side. Leave a few days between the rounds, or use different people for each round.
- Say: "We're testing the app, not you. Think out loud. I won't help unless you're stuck for a minute."

## Tasks

### Members (3 people, demo role "Mitglied")

| # | Task as said to them | Shortest path before | Shortest path now |
|---|---|---|---|
| M1 | "Sag für die nächste Probe zu." | Start: Ich komme (1) | same (1) |
| M2 | "Öffne deine Stimme für die nächste Probe." | Start: Meine Noten (1) | same (1) |
| M3 | "Such dir die Noten von *Egmont* heraus." | Tab Archiv → Egmont (2) | Mehr → Archiv → Egmont (3), or Lupe → Egmont (2) |

M3 checks what the new structure risks: the archive is no longer a tab.

### Admin (1 person, demo role "Verwaltung")

| # | Task as said to them | Shortest path before | Shortest path now |
|---|---|---|---|
| A1 | "Sieh nach, was gerade auf dich wartet, und öffne die älteste Meldung." | Start: "N Dinge" aufklappen → Meldungen (2) | Start: "N Dinge" → Zu erledigen → a report row (2), or Verwaltung → Meldungen (2) |
| A2 | "Prüf, ob die Verbindung zu Google funktioniert." | Mehr → Status (2) | Verwaltung → Einstellungen → Status (3) |
| A3 | "Schalt die Funktion *Wünsche* aus." (then back on) | Mehr → Einstellungen → Funktionen (2 + scroll) | Verwaltung → Einstellungen → Funktionen (2 + scroll) |

A2 is one tap longer now on purpose, as the price of having one place for settings. Watch whether people find it without a wrong tap.

## Note per person and task

| Person | Round | Task | Done? | Taps | Wrong taps | Time | Stuck where / said |
|---|---|---|---|---|---|---|---|
| M-a | before | M1 | | | | | |

Afterwards ask each person: "Was war am schwersten?" and "Was hast du vermisst?"

## Done when (from #185)

- After: every member does M1 and M2 in ≤ 2 taps, with no wrong tap.
- After: fewer wrong taps in total than before, across all tasks.
- Every place someone got stuck goes into a new issue, linked to #185.

Post the filled-in table in #185.
