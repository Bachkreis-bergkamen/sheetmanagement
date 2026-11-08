# Connecting Google Drive, Calendar and Sheets

The app reads your sheet music from Google Drive and your dates from Google Calendar through a **service account**: a separate Google identity that only sees what you share with it. Everything here is free. You don't need a billing account or a credit card.

It takes about 15 minutes. Afterwards, open `/einstellungen/status` in the app to check each connection.

## 1. Create a Google Cloud project

1. Open the [Google Cloud console](https://console.cloud.google.com/), ideally signed in with the account that owns the sheet-music folder and the calendar.
2. Create a new project (project picker at the top → **New project**). Any name works, e.g. "Notenarchiv".

If Google asks you to set up billing, you can skip it: the APIs used here are free.

## 2. Turn on the three APIs

In **APIs & Services → Library**, search for each of these and click **Enable**:

- Google Drive API
- Google Calendar API
- Google Sheets API

## 3. Create the service account and its key

1. **IAM & Admin → Service Accounts → Create service account.** Name it e.g. "notenarchiv-app". Skip the optional steps (it needs no roles).
2. Open the new service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
3. Note the service account's email address (`…@….iam.gserviceaccount.com`). You'll share things with it next.

**Treat the key file like a password.** Don't put it in the project folder, and never commit it. If it leaks, delete the key in the console and create a new one.

> Using a Google Workspace organisation? If key creation is blocked, an admin has to allow it for this project (policy `iam.disableServiceAccountKeyCreation`). Personal Gmail accounts aren't affected.

## 4. Share your folders and calendar with the service account

Share with the service account's email, like you would with a person:

| What | Where | Access |
|---|---|---|
| The sheet-music archive folder | Drive → right-click the folder → **Share** | Viewer (Editor for `DRIVE_WRITE`, see step 9) |
| The current-programme folders ("Programm A-Orchester" …) | same | Viewer |
| The rehearsal/concert calendar | Calendar → ⋮ next to the calendar → **Settings and sharing → Share with specific people** | See all event details (Make changes to events for `CALENDAR_WRITE`) |
| The Repertoire sheet (create it first, see below) | Sheets → **Share** | Editor |

Drive may warn that the address is outside your organisation. That's expected.

**The Repertoire sheet** holds what neither Drive nor Calendar knows: concert programmes, the orchestra's past concerts and extra details per piece. Create an empty Google Sheet for it, e.g. `91 | Repertoire` in the sheet-music folder, and share it as above. Leave it empty: the app fills it in step 8.

## 5. Collect the ids

- **Folder id:** open the folder in Drive. The id is the last part of the URL: `drive.google.com/drive/folders/<this part>`.
- **Current programmes** (optional): the ids of the folders with what each orchestra is playing now, e.g. "Programm A-Orchester", "Programm Ehemaligenorchester". Put them into `DRIVE_CURRENT_PROGRAM_FOLDER_ID`, separated by commas. Their pieces show up in the app with a tag per programme, taken from the folder name ("Programm A-Orchester" → "A-Orchester"). A "Programm …" folder (or a shortcut to one) inside another programme folder counts for both: if the Ehemaligenorchester's folder links to the A-Orchester's, those pieces get both tags.
- **Calendar id:** Calendar → **Settings and sharing → Integrate calendar → Calendar ID**. For a Gmail account's main calendar, it's the email address.
- **Sheet id:** open the sheet. The id is the long part of the URL: `docs.google.com/spreadsheets/d/<this part>/edit`.

The **Kalender abonnieren** link on the concerts page opens this calendar in the member's own Google Calendar. That only works if they can see the calendar: either make it public (**Settings and sharing → Access permissions → Make available to public**) or share it with each member. The app itself only needs the service-account share from step 4.

## 6. Give the app the key and the ids

The key is easiest to handle as one line of base64, since that avoids quoting problems:

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\key.json"))
```

```bash
# macOS / Linux
base64 -w0 path/to/key.json   # macOS: base64 -i path/to/key.json
```

(Pasting the key file's JSON as is also works.)

**For local development**, put the values into `.dev.vars` (copy `.dev.vars.example`; the file is git-ignored):

```
GOOGLE_SERVICE_ACCOUNT_JSON="<the base64 line>"
DRIVE_ARCHIVE_FOLDER_ID="<folder id>"
# DRIVE_CURRENT_PROGRAM_FOLDER_ID="<folder id>"   (optional)
CALENDAR_ID="<calendar id>"
REPERTOIRE_SHEET_ID="<sheet id>"
```

**For the deployed app**, store each value as a Cloudflare secret. Wrangler asks for the value, so it never ends up in your shell history:

```bash
pnpm wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
pnpm wrangler secret put DRIVE_ARCHIVE_FOLDER_ID
pnpm wrangler secret put CALENDAR_ID
pnpm wrangler secret put REPERTOIRE_SHEET_ID
```


The secrets go to the worker named in `wrangler.toml` (`name = "noten"`). If you deploy under another name, change it there, so deploys and secrets always go to the same worker. (Passing `--name` on the command line works for `wrangler` directly, but `pnpm run deploy -- --name …` does not reach it.)

## 7. Check

Open `/einstellungen/status` in the app. Each line should say **Verbunden**:

- **Google-Dienstkonto:** the key works.
- **Notenarchiv:** shows how many pieces and files were found.
- **Probenkalender:** shows the upcoming dates.
- **Repertoire-Tabelle:** says "Nicht eingerichtet" until step 8.

The archive is re-read automatically every 5 minutes. **Archiv neu einlesen** on the status page forces it right away.

## 8. Set up the Repertoire sheet

Open `/einstellungen/tabelle` in the app (the **Tabelle & Daten** section of the settings) and click **Jetzt einrichten**. The app adds three tabs:

- **Stücke:** one row per piece. Every folder in the archive is added automatically, with title and composer read from the folder name. Fix a wrongly read name here, not in Drive. Pieces without sheet music (e.g. from old programmes) are rows without a Drive-Ordner-ID.
- **Konzerte:** one row per concert. Confirmed concerts from the calendar are added automatically. Add past concerts by hand; **Datum** may be just a year (`1957`) or a month (`1957-12`).
- **Programm:** one row per piece in a concert. Pick **Konzert** and **Stück** from the dropdowns; **Nr.** is the order and may stay empty.

The grey id columns are what the app uses to recognise rows. Don't edit them. Columns can be reordered, and you can add your own. Changes show up in the app within a minute. Running setup again is safe: it only adds what's missing.

If the setup page lists **Hinweise zur Tabelle** (e.g. a piece name in "Programm" that isn't in "Stücke"), fix those rows in the sheet.

## 9. Turn on sign-in

Until this step, the app is open to anyone with the link and nobody can change anything in it. With sign-in on, only members see the app, and admins hand out rights. Members sign in with their own Google account. This is free too.

**Run `/einstellungen/tabelle` once more first** if your sheet is from before sign-in existed. It adds the tabs **Mitglieder**, **Gruppen**, **Rechte** and **Zugangsanfragen**.

1. In the Cloud console (same project as in step 1): **APIs & Services → OAuth consent screen**.
   - User type **External**. App name e.g. "Notenarchiv", your email as support and developer contact.
   - **Branding:** leave out the logo and the app-domain fields (home page, privacy policy, terms, authorized domains). They're only needed for *brand verification*, which shows your app name and logo on Google's sign-in screen. Brand verification needs a domain you own, which a free `workers.dev` address isn't. Without it, sign-in works the same; Google just shows a plainer screen.
     - The app still has its own privacy notice and terms (`/datenschutz`, `/nutzungsbedingungen`), linked on every page. Fill in who is responsible, as secrets like in step 6: `LEGAL_NAME` (defaults to `ORCHESTRA_NAME`) and `LEGAL_EMAIL`, optionally `LEGAL_ADDRESS`. The texts describe what the app does, but they're a template, not legal advice: have someone in the club check them.
     - With your own domain later, you can fill in the fields with these pages and verify the brand.
   - Scopes: add none. The app only asks for name and email (`openid email profile`), which are non-sensitive: Google requires no verification for them.
   - Under **Audience** (or **Publishing status**), click **Publish app** so the status is **In production**. Brand verification isn't needed for that. While the app is in "Testing", only the test users listed there (at most 100) can sign in.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - **Authorized redirect URIs:** your app's address plus `/auth/callback`, e.g. `https://notenarchiv.<account>.workers.dev/auth/callback`. For local development also add `http://localhost:5173/auth/callback`. The status page shows the exact address.
   - Note the **Client ID** and **Client secret**.
3. Make a random session secret (at least 32 characters):

   ```powershell
   # Windows PowerShell
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```

   ```bash
   # macOS / Linux
   openssl rand -base64 32
   ```

4. Add the values like in step 6 (`.dev.vars` locally, `pnpm wrangler secret put …` for the deployed app):

   ```
   GOOGLE_OAUTH_CLIENT_ID="<client id>"
   GOOGLE_OAUTH_CLIENT_SECRET="<client secret>"
   SESSION_SECRET="<the random string>"
   BOOTSTRAP_ADMINS="you@example.org,second-admin@example.org"
   ```

   **BOOTSTRAP_ADMINS** always have every right, whatever the sheet says, so the app can't lock everyone out. Use two accounts, e.g. the orchestra's and your own.

5. Open the app and sign in with a bootstrap admin account. **Verwaltung** (`/admin`) now appears in the menu.

**How access works:**

- Anyone listed in **Mitglieder** can see everything. Someone who signs in but isn't listed can click **Zugang beantragen**; the request shows up under Verwaltung, where an admin approves it with one click.
- Extra rights are given in **Rechte**, to an email address or to a group from the **Gruppen** column in Mitglieder (e.g. `Vorstand`):

  | Right | Allows |
  |---|---|
  | `programme.bearbeiten` | Edit concert programmes in the app |
  | `mitglieder.verwalten` | Approve members and give rights (Verwaltung); set the status of wishes and answer them |
  | `stuecke.bearbeiten` | Edit a piece's details on its page (title, composer, notes, **Hörbeispiel** link …); look after problem reports (**Meldungen**) |
  | `archiv.bearbeiten` | Add past concerts (on **Konzerte**) and pieces without sheet music (on **Stücke**) for the orchestra's history |

- Renaming a piece in the app also renames it in every programme row of **Programm**, since programmes find pieces by title.

- The **Instrument** column in Mitglieder drives **Meine Noten**: write it like a part name (`Geige 2`, `2. Violine`, `Klarinette`, `Cello`). Members without one pick it once on the page, which saves it there. Which shared parts (`B-Stimmen`, `Holz` …) an instrument reads from is set in the config preset (`sharedParts`).
- Every member can report a problem with a part (flag button on the piece page) and add wishes and +1s on **Wünsche**. Both are stored in their own tabs, **Meldungen** and **Wünsche**; an older sheet gets them when you run **Tabelle einrichten** again.
- The tab **Fehlende Stimmen** mirrors `/fehlende-stimmen`: one row per part whose file name says `FEHLT`, `LEER` or `UNVOLLSTÄNDIG`. The app rewrites it when it syncs the sheet (at most once a minute), so only tick **erledigt** there; other edits are overwritten. A row disappears once its file is renamed, and a tick stays while the gap is still listed. Like Meldungen and Wünsche, an older sheet gets the tab from **Tabelle einrichten**.

- Everything can also be edited directly in the sheet. Changes apply within a minute; removing someone from Mitglieder locks them out at once.
- App access and Drive access are separate: to open the PDFs, members still need access to the sheet-music folder in Drive.
- **Problem reports in Drive (optional):** with `DRIVE_WRITE=true` and the service account as **Editor** of the sheet-music folder, reports also show up in Drive:
  - Each report on a part becomes a comment on that file ("Über die Noten-App gemeldet: Seiten fehlen – Seite 3"), without the reporter's name. Closing the report on **Meldungen** resolves the comment, and reopening it reopens it.
  - On **Meldungen**, **Im Dateinamen markieren** adds the status word from the naming convention to the file name (`Elegie - Viola - UNVOLLSTÄNDIG.pdf`). Closing the report removes it again, unless someone changed the name in the meantime. The app never renames files on a member's report alone.
  - Without `DRIVE_WRITE` the app only asks Google for read access to Drive, whatever the folder's sharing allows. If Drive refuses a change, the report is still saved and **Meldungen** says so.
- **New sheet music from the app (optional, #193):** with `DRIVE_WRITE=true` and the service account as **Editor** of the sheet-music folder, people with **archiv.bearbeiten** see "Noten in Drive" on a piece page:
  - a piece without sheet music gets **Ordner in Drive anlegen**: a folder named by the convention (`<Komponist> <Opus> - <Titel>`, editable) in the archive, linked to the piece's row in "Stücke";
  - PDFs dropped on the page get convention names (`<Kurztitel> - <Stimme>.pdf`, read from the old names; unclear ones are named by hand) and go **from the browser straight to Drive**, never through the Worker. A file of the same name is replaced as a new revision, and a `- FEHLT` placeholder whose part arrives goes to the bin;
  - **Stimme fehlt** creates the `- FEHLT` placeholder.
  - A service account has **no storage of its own** (its quota is 0), so it can't own a new file in someone's My Drive; replacing existing files works. For new files an admin connects the account that owns the archive once on **Status → "Drive-Konto für Uploads verbinden"** (Google asks for access to Drive). New parts are then uploaded as that account and belong to it, as if uploaded by hand; the refresh token is kept encrypted like the mail account's. In a **shared drive** with the service account as Content manager no account is needed.
  - Drive access is a *restricted* scope: while the OAuth app is unverified Google shows a warning on the consent page, and in **Testing** status the permission ends after 7 days (connect again, or publish the app).
- **Current programme in Drive (optional, #60):** with `DRIVE_WRITE=true`, `DRIVE_CURRENT_PROGRAM_FOLDER_ID` and the service account as **Editor** of the current-programme folder, the app keeps it in step with the programmes:
  - On a concert page, people who may edit programmes see **Aktuelles Programm im Drive**: how many of the programme's pieces are in the orchestra's programme folder, and **Abgleichen** to make it match. Saving the programme of an orchestra's next concert does the same on its own.
  - The orchestra's folder is the "Programm …" folder whose name matches the concert's **Orchester** (`EO` → "Programm Ehemaligenorchester", `A` → "Programm A-Orchester"). If there is none yet, the app makes "Programm <Orchester>" next to the others; with no programme folders at all, the current-programme folder itself is the programme.
  - Only shortcuts are made and taken out: one per piece, named like the piece's folder. Shortcuts to pieces that left the programme go to the bin (not deleted); files and folders in there are never touched.
- **Concerts on the orchestra's website (optional, #197):** the app stays members-only, but the orchestra's own website can show concerts without anyone typing them in twice.
  - On a concert's page, people with `programme.bearbeiten` see **Veröffentlichen** above the programme. Only published concerts are in the feed; **Zurückziehen** takes one out again. This works for upcoming concerts and for past ones from the **Chronik**.
  - `https://<app>/api/konzerte` answers JSON without sign-in: `upcoming` (soonest first) and `past` (newest first), each concert with `title`, `date` (`2026-11-24`, or `1957-12` when only the month is known), `dateText`, `start`/`end` when the calendar has them, `location`, `orchestras` and `program` (`title`, `composer`, `orchestra`). Nothing about members. Any website may read it (CORS), and it is cached for 15 minutes.
  - `https://<app>/api/konzerte.ics` is the published upcoming concerts as a calendar to subscribe to, with the programme in the description.
  - On the website, for example: `const { upcoming, past } = await (await fetch('https://noten.example.org/api/konzerte')).json();`
- **Date polls (optional, #95):** the orga team agrees on dates on **Terminumfragen** (`/termine`) before they go into the calendar. Polls and answers are kept in a small Cloudflare D1 database, not in the sheet:
  1. Create it once: `pnpm wrangler d1 create noten --jurisdiction eu`.
  2. Add the binding it prints to `wrangler.toml`, named `DB`:
     ```toml
     [[d1_databases]]
     binding = "DB"
     database_name = "noten"
     database_id = "<the id from step 1>"
     ```
  3. Deploy. The app makes its tables on first use; there's nothing to migrate. Until then the page says it isn't set up.
  - Who may start and close polls: the right `termine.planen` in **Rechte** (the preset gives it to Orga and Vorstand). A poll is for the groups chosen when it's started: only their members see and answer it, and the menu shows **Terminumfragen** to them.
  - Closing a poll with a date gives a link that opens Google Calendar with the event filled in; the app itself doesn't write to the calendar.
  - Backups: D1 keeps 30 days of history (Time Travel), see `pnpm wrangler d1 time-travel info noten`.
  - **Weekly backup to Drive (optional, #186):** once D1 is the source, set `DRIVE_BACKUP_FOLDER_ID` to a Drive folder that **only the admins** can open (it holds members' names and email addresses). Every week the app puts `daten-<date>.json` there, the same file as **Alles herunterladen**, keeps the last 8 and moves older ones to the bin. It writes as the account connected on **Status → "Drive-Konto für Uploads verbinden"**; without one, as the service account with `DRIVE_WRITE=true`, which only works in a shared drive (Content manager). **Status → Hintergrundaufgaben → Sicherung in Drive** runs it at once.
  - **Restoring a backup:** on **Setup → Datenbank**, **Aus einer Sicherung wiederherstellen** takes a file from **Alles herunterladen** and replaces everything in D1 with it (D1 becomes the source). Rows that no longer fit, e.g. a programme entry whose concert is missing, are left out and counted.
- **Turning sign-in off again:** set `FORCE_AUTH` to `false` (`pnpm wrangler secret put FORCE_AUTH`). The other values stay, and deleting `FORCE_AUTH` turns sign-in back on. While it's off, the app works as before step 9: anyone with the link can view everything, including `/einstellungen/tabelle` and `/einstellungen/status`, and nobody can change anything, report problems or add wishes. Use it for an instance that should be public, or to get in while Google sign-in is broken.

## 10. Optional extras

None of these is needed to start; `/einstellungen/status` lists the ones that aren't set up yet, each with a link here. Values are stored as secrets like the others (`pnpm wrangler secret put <NAME>`).

### Current-programme folders

`DRIVE_CURRENT_PROGRAM_FOLDER_ID`: the folder ids of "Programm A-Orchester" and the like, separated by commas (step 5). The archive then shows which pieces are on the current programme, and with Drive writing the app keeps those folders in step with the concert programmes (see step 9).

### Drive writing

`DRIVE_WRITE=true`, with the service account as **Editor** of the sheet-music folder (step 4). Problem reports then also appear as comments on the files, status words can be put into file names, and the current-programme folders can be filled from a programme. Without it the app only reads Drive. Details in step 9 under "Problem reports in Drive".

### Calendar writing

`CALENDAR_WRITE=true`, with the calendar shared with the service account as **Make changes to events** (step 4). People with the right "termine.planen" can then add a concert, rehearsal or Generalprobe on **Kalender** (button "Termin"); it goes straight into the Google Calendar. Without it the app only reads the calendar and the form says what's missing.

### YouTube durations

`YOUTUBE_API_KEY`: lets the piece editor suggest a piece's duration from its Hörbeispiel video. Free.

1. In the Cloud project from step 1: **APIs & Services → Library**, search **YouTube Data API v3**, **Enable**.
2. **APIs & Services → Credentials → Create credentials → API key**.
3. Optional but sensible: **Edit API key → API restrictions → Restrict key → YouTube Data API v3**.
4. `pnpm wrangler secret put YOUTUBE_API_KEY` and paste the key.

### Notifications

`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`: reminders on members' phones (unanswered rehearsals, rented music that is due) and a notice to the admins when the Google connection breaks. Members turn them on per device under **Profil**. No Google setup and no email account needed.

1. `node scripts/vapid-keys.mjs` prints a new key pair.
2. Store both values with `pnpm wrangler secret put VAPID_PUBLIC_KEY` and `pnpm wrangler secret put VAPID_PRIVATE_KEY`.
3. Keep them: a new pair makes every device sign up again.

The privacy contact (`LEGAL_EMAIL`) is passed to the push services as the app's contact.

### Database (D1)

The binding `DB` in `wrangler.toml`: where notifications, the reminder log, date polls and members' own practice time are kept. The deploy creates it on its own; to keep it in the EU, create it first with `pnpm wrangler d1 create noten --jurisdiction eu` and add its `database_id` to `wrangler.toml` (see "Date polls" in step 9). The deploy workflow applies the tables from `migrations/`; `/einstellungen/status` shows the version.

### Privacy contact

`LEGAL_NAME`, `LEGAL_ADDRESS` and `LEGAL_EMAIL`: who is responsible for the app, shown on `/datenschutz` and `/nutzungsbedingungen`. Without them the pages say the contact is missing.

### Email

Sign-in links for members without a Google account, and reminders by email for members without notifications ([#123](https://github.com/lgreil/sheetmanagement/issues/123)). The mails go out through Gmail from the orchestra's own Google account: free, and they don't land in spam. Needs sign-in (step 9) and the database (above).

1. In the Cloud project of step 1, turn on the **Gmail API** (APIs & Services → Library).
2. On the **OAuth consent screen**, add the scope `https://www.googleapis.com/auth/gmail.send` and set the publishing status to **In production**. Google then shows a warning that the app isn't verified; that's fine for an orchestra (fewer than 100 accounts ever connect it). In "Testing", the permission ends after 7 days.
3. Open `/einstellungen/status` as an admin and click **E-Mail-Konto verbinden**. Sign in with the Google account that should send, and allow "Send email on your behalf". No new redirect URI is needed: it uses `/auth/callback` from step 9.

The app keeps the permission (a refresh token) in the database, encrypted with `SESSION_SECRET`; a new secret means connecting again. `/einstellungen/status` shows the sending address, where links in mails lead (the address you connected from), and the last error. **Trennen** forgets the account; to take the permission back on Google's side too, remove the app under myaccount.google.com → Security → Third-party connections.

- Sign-in links are only sent to addresses in **Mitglieder** (and `BOOTSTRAP_ADMINS`); the page answers the same either way. At most 3 per address and 10 per IP address in an hour.
- Reminders go by push where a member has a device, else by email. A signup reminder has one-click answers (the answer is saved by a button on the page, so mail scanners answer nothing). Members turn email off under **Profil**.
- A Gmail account may send about 500 mails a day, Workspace 2,000; the app sends at most 20 every half hour.

## Troubleshooting

| Message | Cause |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON is neither valid JSON nor base64…` | The key was cut off or got extra quotes. Use the base64 form. |
| `Invalid grant: account not found` | The service account was deleted, or the key belongs to another project. Create a new key. |
| `Invalid JWT Signature` | The key was deleted or replaced in the console. Create a new key. |
| `Kein Zugriff auf … (404)` or `(403)` | Wrong id, or not shared with the service account's email (step 4). |
| API "has not been used in project … or it is disabled" | Step 2 is missing for that API. Enabling can take a minute to apply. |
| `The caller does not have permission (403)` on `/einstellungen/tabelle` | The sheet is shared as Viewer. The service account needs Editor. |
| Google says `redirect_uri_mismatch` when signing in | The address under **Authorized redirect URIs** (step 9) doesn't match exactly. Copy it from the status page. |
| Signed in, but always back on "Zugang beantragen" | The email isn't in **Mitglieder**, or is spelled differently there. |
