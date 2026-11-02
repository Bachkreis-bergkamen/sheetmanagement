# Phone and offline

Most members use Sheetmanagement on a phone, at rehearsal or on the way there.

- **Install it:** the app has a web manifest, so "Add to Home Screen" (Safari) or "Install app" (Chrome) puts it on the home screen.
- **Offline:** a service worker keeps the pages a member opened, for rehearsal halls without reception. The overview, the music table, *My parts* and every piece's page are kept ahead of time, once a day, so they open offline even if they were never opened on the device.
- **Parts offline:** **Save offline** on *My parts* keeps a concert's parts; the download button next to any part on a piece's page keeps just that one, from any instrument. *My parts* lists everything saved on the device under **Offline on this device**, where each part opens in the app's viewer (one at a time or all in a row), also without a connection. Signing out deletes pages and parts.
- **Updates:** after a deploy, an open app offers to reload within a few minutes; nothing reloads by itself.
- **Own calendar:** each member can create a personal calendar link on the profile page (`/kalender/<token>.ics`) with the orchestra's dates, their own answer and what's rehearsed. It's signed with `SESSION_SECRET` and can be renewed or revoked.
- **Notifications:** turned on per device under **Profile**; reminders for unanswered dates and rented music that's due.

<p>
<img src="https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/phone-overview.png" width="250" alt="Overview on a phone">
<img src="https://raw.githubusercontent.com/lgreil/sheetmanagement/main/docs/screenshots/phone-rehearsal.png" width="250" alt="A rehearsal on a phone">
</p>
