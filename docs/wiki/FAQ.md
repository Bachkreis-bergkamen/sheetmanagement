# FAQ

**Does it really cost nothing?**
Yes, for an orchestra-sized group. It runs on Cloudflare's free Workers plan (with free KV, D1 and Durable Objects) and Google's free APIs. No domain needed: it runs on `*.workers.dev`.

**Do we have to move our music out of Google Drive?**
No. The app reads Drive, Calendar and the sheet; they stay usable on their own. If you stop using the app, nothing is lost.

**How do members sign in?**
With Google, or, if an admin connected Gmail, with a sign-in link by email. Who may sign in and what they may do is kept in the sheet's "Mitglieder" tab.

**Who can see what?**
Rights per member are in the sheet (e.g. `mitglieder.verwalten` for organisers). Members see the library, dates and their own data; organisers can edit programmes, attendance and more.

**Can we use it in English?**
Yes: `APP_LANGUAGE=en` when building. Choose before the first deploy; see [[Configuration]].

**Our parts are named differently.**
The naming rules (separator, status words, the score prefix) and instrument spellings are in the preset; see [[Configuration]].

**Something says "not connected".**
Open `/einstellungen/status`: it checks each connection and says what's missing.

**Where's the data stored?**
Your music and dates stay in your Google account. Member data is in your Google Sheet. The app itself only stores push subscriptions and which reminders went out (Cloudflare D1, can be kept in the EU), plus a cache.

**Something else?**
[Open an issue](https://github.com/lgreil/sheetmanagement/issues/new/choose).
