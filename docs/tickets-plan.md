# Plan: concert tickets and check-in at the door

Status: phases 1 and 2 are built (free seating, reservations paid at the Kasse, the online surcharge, check-in at the door), and Freikarten (§4.6). Wallet passes are only planned (§7). Written 2026-10-31. The public site (bachkreis-berg-de) sells through `/konzerte/karten`; this plan is about what sits behind it.

## 1. Where things stand

- **How tickets are sold today:** only on paper, in the school's Sekretariat before the concert and at the Abendkasse on the evening.
- **How seating works:** some concerts have reserved seats (Platzkarten), others free seating. Both must work.
- **What the public site has:** it shows the concerts from noten's feed (`/api/konzerte`) through a service binding. It has no sign-in and no database, and on purpose stores no personal data.
- **What noten already has:**
  - Sign-in, and rights given through groups in the "Rechte" tab (`src/lib/access/access.ts`).
  - D1 for the data the app writes itself (`migrations/`).
  - Mail (`src/lib/server/mail`) and rate limits (`rate_limits`).
  - An installable app that works offline.
  - Concerts from Google Calendar, which are the source of truth.

So the tickets live in noten, and the site is only the shop window.

## 2. Decisions to make first

| Topic | Proposal | Why it matters |
|---|---|---|
| **Payment** | Start with **reservations paid at the Kasse** (phase 1). Online payment comes later, as an option per orchestra, and is off by default. If it comes, **Wero** first: it's the cheapest card-free option. | Principle 3, "Nothing costs money": PayPal or Stripe take about 1.5–3 % of each sale. Wero through a payment provider costs about 0.77 % (Payone/Sparkasse) or 0.85 % + 5 ct (VR Payment, plus a monthly fee after the first year), as of October 2026. Bank transfer is free, but someone has to match payments by hand. |
| **Build or use pretix** | Build it only if the orchestra wants everything in one app. Otherwise use pretix: it's open source, has seat plans and a scanner app (pretixSCAN), and the hosted version charges a fee per ticket. | This is a real project, not a page: orders, cancellations, seat plans, a scanner and the legal texts. |
| **Who gets the ticket money** | The Förderverein or the school; the board decides. | It sets the name on the order confirmation, in the legal notice and as the payment receiver. |
| **Feature switch** | A new feature `tickets` that is **off unless a deployment turns it on** (`FEATURES_ON="karten"` or the preset). | Today every feature is on by default (`src/lib/features.ts`). Selling tickets has legal and payment consequences, so an orchestra has to choose it. |
| **Online surcharge** | Decided: online tickets cost the Kasse price **plus a surcharge** that covers the fees, set per concert as a percentage (rounded up to the cent) and/or a fixed amount per ticket. Free tickets stay free; tickets sold at the Kasse have none. | Transparent everywhere: the website, the confirmation mail and the ticket page show price and surcharge apart, and say what the surcharge is for. Each ticket stores its surcharge (`tickets.fee_cents`), so the organiser sees how much of the takings go to fees. |

## 3. Data (D1, new migration `0010_tickets.sql`)

The app writes all of this itself and nobody edits it by hand, so it belongs in D1, not in the sheet.

```sql
-- One row per concert that sells tickets. concert_id is the Calendar event id the feed uses.
CREATE TABLE IF NOT EXISTS ticket_sales (
	concert_id TEXT PRIMARY KEY,
	seating TEXT NOT NULL,              -- 'free' | 'reserved'
	capacity INTEGER,                   -- free seating: how many may come
	plan TEXT,                          -- reserved: the hall as JSON (rows, seats, aisles, wheelchair spaces)
	prices TEXT NOT NULL,               -- JSON: [{ type: 'adult', label, cents }]
	online_until TEXT NOT NULL,         -- online sales end here, e.g. two hours before
	open INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ticket_orders (
	id TEXT PRIMARY KEY,                -- random
	concert_id TEXT NOT NULL,
	name TEXT NOT NULL,
	email TEXT,                         -- empty for sales at the Sekretariat or the Abendkasse
	channel TEXT NOT NULL,              -- 'online' | 'sekretariat' | 'abendkasse'
	status TEXT NOT NULL,               -- 'held' | 'reserved' | 'paid' | 'cancelled'
	held_until TEXT,                    -- seats held while someone is in checkout
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
	code TEXT PRIMARY KEY,              -- 128 random bits, base32: the QR code holds only this
	order_id TEXT NOT NULL,
	concert_id TEXT NOT NULL,
	seat TEXT,                          -- 'F 3'; empty for free seating
	type TEXT NOT NULL,
	cents INTEGER NOT NULL,
	checked_in_at TEXT,
	checked_in_by TEXT
);

-- A seat can only be sold once, even when two people click it at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_seat ON tickets (concert_id, seat) WHERE seat IS NOT NULL;
```

- **No double sales:** the unique index is all the locking needed. Two buyers can't get the same seat, whichever Worker instance answers them.
- **Seats held during checkout:** a held order keeps its seats for 10 minutes. The existing job trigger (`src/lib/server/jobs/`) clears orders that expire.
- **Free seating:** a count per concert, checked against `capacity` in the same statement that inserts the tickets.

## 4. The pieces

### 4.1 Setting up a concert (organisers, laptop)

A new right, `karten.verwalten`, opens `/termine/[id]/karten`. There, an organiser:

- turns sales on, chooses free seating or a seat plan, and sets the prices and when online sales end;
- builds the seat plan from rows and seats per row, an aisle and wheelchair spaces. A plan can be saved per hall and reused, e.g. "Aula" or "Stadthalle";
- sees the sold, reserved and free counts, and can export the guest list.

### 4.2 Selling at the Sekretariat and the Abendkasse

A new right, `karten.verkaufen`, opens `/karten/verkauf`. It's the same seat plan, with the channel set to `sekretariat` or `abendkasse` and an optional e-mail address.

- The paper ticket gets the same QR code: the school prints it, or noten produces a PDF in the browser with `@cantoo/pdf-lib`, which noten already uses.
- Cash is entered as "paid". Nothing changes for the person at the till except that a phone or laptop replaces the ticket roll.

### 4.3 The public sale (site → noten)

The site reaches noten through the same service binding as the feed. The feed marks concerts with an open sale (`tickets: true`).

- `GET /api/karten/[concert]`: prices (Kasse price, surcharge and online price apart), seating and seats left. Cached for a few seconds and holding no personal data.
- `POST /api/karten/[concert]`: name, e-mail and the number of tickets per kind; places the reservation if it still fits and sends the confirmation. Built for free seating, so no hold step.
- Phase 3 (seat plans) adds the hold: `POST /api/karten/[concert]/halten`, then the order.

The buyer's tickets are at `/karte/[order]` on noten (the order id is 128 random bits), one QR code per ticket. The QR codes are drawn by noten itself (`src/lib/tickets/qr.ts`), without a library.

Abuse protection:
- rate limits through the existing `rate_limits` table: per caller, per buyer's e-mail and per concert;
- Cloudflare Turnstile (free) on the order, which the site already plans for its forms (not built yet);
- at most 10 tickets per order.

### 4.4 Check-in at the door

A new right, `karten.einlass`. The group "Einlass" gets it for the evening, and removing people from the group afterwards revokes it. The page is `/einlass/[concert]`, made for phones:

1. **Before the doors open**, still with reception, the page downloads every valid ticket code for this concert and keeps it in IndexedDB, with seat, type and name.
2. **Scanning:** the camera reads the QR code.
   - The browser's built-in `BarcodeDetector` covers Chrome on Android.
   - iPhones don't have it, so a small reader runs in the browser as a fallback. noten avoids runtime dependencies, so pick a WASM decoder that is loaded only on this page.
3. **Checking:** the code is looked up in the local list. The screen turns big and green ("Reihe F, Platz 3 · Erwachsene") or red ("Schon eingelassen 18:42" / "Unbekannt"), and the phone vibrates. Check-ins are written locally first.
4. **Syncing:** whenever there's reception, local check-ins go to `POST /api/einlass/[concert]` in batches, and the server returns the check-ins from the other phones.
   - Online, a ticket used at one door is rejected at the other.
   - Offline, two phones can admit the same code twice; it shows up after syncing. That's acceptable for a school concert.
5. **Without a code:** search by name, and admit by hand.
6. **Counter:** "312 of 400 in", for the fire-safety head count.

**Why the code is just a random number, not a signed one:** the list downloaded beforehand already proves a code is real, and a signature check on the phone would need either the secret on every phone or extra public-key code. 128 random bits can't be guessed.

### 4.5 Mails

- The order confirmation, with one QR code per ticket, goes through `src/lib/server/mail`.
- The wallet passes from the mock-up (Apple/Google Wallet) need signing certificates and a paid Apple developer account, so they are left out under principle 3. The mail and a PDF are enough.

### 4.6 Freikarten (built)

Organisers with `karten.verwalten` add Freikarten for a named guest on the sale's page: a name, an optional e-mail address and 1–10 tickets.

- **Stored as:** an order with `channel = 'free'` and `status = 'paid'`, its tickets of type `freikarte` at 0 € without a surcharge. No migration: `channel` was always free text.
- **Capacity:** Freikarten don't count against it. The capacity is "Plätze online", so a Freikarte never takes a seat away from the website (`takesSeat()` in `src/lib/tickets/tickets.ts`). The organiser keeps seats free for them, as for the Sekretariat. The counts show them apart.
- **Getting in:** the door list and `/karte/[order]` treat them like any other ticket, labelled "Freikarte", with nothing to pay.
- **The guest:** with an e-mail address, they get the confirmation mail without prices and without the pay-at-the-door line. Without one, the organiser gets the link to share or print, and every Freikarten order in the list keeps an "open tickets" link.
- **Lists:** the reservations list and `gaeste.csv` mark them as Freikarte. Cancelling and restoring work as for reservations; restoring brings one back as paid.

## 5. Legal (have this checked before going live)

- **Privacy notice:** buyers aren't members. noten's privacy text needs a section on ticket orders that covers:
  - which data is processed: name, e-mail, the order and the check-in time;
  - the legal basis: Art. 6 (1) (b) GDPR;
  - deletion: guest lists and check-ins, e.g. 30 days after the concert;
  - retention: accounting records, up to 10 years, § 147 AO.
- **Ordering, when payment is online:**
  - the button must say "zahlungspflichtig bestellen" (§ 312j BGB);
  - the price must include everything;
  - there's no right of withdrawal for events on a fixed date (§ 312g (2) no. 9 BGB), but the buyer has to be told that before ordering.
- **Legal notice and terms:** who sells the tickets (see §2), plus short terms of sale (cancellation if the concert is cancelled, no resale).
- **Data location:** create D1 with `--jurisdiction eu`, as `wrangler.toml` already recommends.

## 6. Phases

| Phase | Content | Done when |
|---|---|---|
| 1 | The `tickets` feature, migration, organiser setup for **free seating**, online **reservation** (paid at the Kasse), confirmation mail with QR codes | A test concert takes reservations from the site's sale page and they appear in noten |
| 2 | **Check-in** at the door: offline list, scanner, sync, name search, counter | Two phones at two doors admit a test audience, one of them in airplane mode |
| 3 | **Seat plans**: hall editor, seat choice on the site, holds that expire | Two browsers can't book the same seat |
| 4 | **Sekretariat and Abendkasse** in noten: selling on the same plan, printed tickets with codes | The Sekretariat sells one concert only through noten |
| 5 (optional) | **Online payment**, per deployment and off by default, once the board has accepted the fees. Wero through the association's bank's payment provider (Payone at Sparkassen, VR Payment at Volksbanken); the association's bank account must be a business or association account | A test payment in the provider's sandbox marks the order as paid |

Phases 1 and 2 already replace the paper reservation list and speed up entry at no cost. Phase 5 is the only one that costs money.

## 7. Wallet passes (later, not built)

Guests could keep their tickets in Apple Wallet or Google Wallet next to the QR codes on `/karte/[order]`. Nothing of this is built. This section says what it would need, so the current design doesn't block it.

### 7.1 Apple Wallet (.pkpass)

- **Account:** the Apple Developer Program (about 99 $ a year) for the association or whoever runs the deployment. In it, a Pass Type ID (`pass.de.example.noten`) and its signing certificate.
- **The file:** a zip with `pass.json` (style `eventTicket`, `serialNumber`, `passTypeIdentifier`, `teamIdentifier`, `organizationName`, `relevantDate`, a QR `barcodes` entry), `icon.png` and `logo.png`, `manifest.json` (SHA-1 of every file), and `signature`.
- **Signing:** the signature is a detached PKCS#7 signature of `manifest.json`, with the pass certificate, its key and Apple's WWDR intermediate certificate. WebCrypto can't build PKCS#7, so the Worker needs a small pure-JS library for it (e.g. PKI.js). Check its size and the CPU time per request. The certificate and key are Worker secrets, never in D1 or the repo.
- **One pass per ticket,** since each ticket has its own code. Several tickets go out as one `.pkpasses` bundle (iOS 15 and later). Served as `application/vnd.apple.pkpass` from a route like `/karte/[order]/wallet.pkpass`, behind the same unguessable order id.
- **Cancellations:** a pass on a phone only changes through Apple's update web service (`webServiceURL`, `authenticationToken`, device registrations and APNs pushes). Leave this out at first: the door list already refuses a cancelled code. Adding it later needs a migration for the device registrations.

### 7.2 Google Wallet (event tickets)

- **Account:** an issuer account in the Google Pay & Wallet Console, and a Google Cloud service account with access to the Google Wallet API. Its JSON key is a Worker secret.
- **Objects:** one `EventTicketClass` per concert (name, venue, start, logo) and one `EventTicketObject` per ticket. The object holds the QR code (`barcode.value` = the ticket code), `ticketHolderName`, the kind as `ticketType` and the seat if there is one.
- **The button:** a link to `https://pay.google.com/gp/v/save/<JWT>`. The JWT is signed with the service account's key (RS256, which WebCrypto can do) and can carry the class and the objects. So adding a pass needs no API call.
- **Cancellations and check-ins:** set the object's `state` to `INACTIVE` or `COMPLETED` through the REST API, with an OAuth token from the service account. Optional, as for Apple.

### 7.3 On `/karte/[order]`

- The official "Add to Apple Wallet" and "Add to Google Wallet" badges go under the lead, above the tickets, for all tickets of the order at once. They show only when the deployment has the secrets set, never for a cancelled order, and never in print (`@media print`).
- Show both badges, or pick by user agent. Neither replaces the QR codes on the page: the page stays the source and keeps working offline and printed.

### 7.4 What the data model already has, and what it would need

- **Already there:** each ticket's `code` is stable, unique and random. It can be the barcode message, Apple's `serialNumber` and Google's object id (`<issuerId>.<code>`) without a new column. The order id is the proof in the link. Name, kind (`labelOf()`), seat, status and channel are on the order and its tickets; the title, date and place come from the calendar.
- **Keep it that way:** never change a ticket's code after it's sent. Keep the barcode content exactly the code, which the door already reads. Keep cancelling as a status, not deleting, so a pass can be voided.
- **Would be new:** settings per deployment (Apple team and pass type id, Google issuer id, and the secrets) in `wrangler.toml` vars and secrets. For live updates only: a `wallet_registrations` table (device id, push token, ticket code) and an `updated_at` on tickets or orders. The pass images can come from the orchestra's logo the page already shows.
