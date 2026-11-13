import { expect, open, resetDemo, test } from './demo.ts';

/** What members and the orga team do every week; a change that breaks one fails its pull request (#142). */
test.beforeEach(async ({ page }) => resetDemo(page));

test('signing up for a concert', async ({ page }) => {
	await open(page, '/kalender/demo-herbstkonzert');
	const yes = page.getByRole('button', { name: 'Ich komme' });
	await yes.click();
	await expect(yes).toHaveAttribute('aria-pressed', 'true');
	await page.reload();
	await expect(page.getByRole('button', { name: 'Ich komme' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText(/1 Zusage/)).toBeVisible();
});

test('answering from the start page', async ({ page }) => {
	// Right on the next date's card, without opening it; the page stays where it is.
	await open(page, '/');
	const card = page.getByRole('form', { name: /^Bist du dabei\?/ }).first();
	await card.getByRole('button', { name: 'Ich komme' }).click();
	// Once answered, the card says so in one line; "ändern" brings the buttons back (#214).
	const change = page.getByRole('button', { name: /^ändern: Bist du dabei\?/ }).first();
	await expect(change).toBeVisible();
	await expect(page.getByText('Du kommst').first()).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
	await change.click();
	await expect(page.getByRole('form', { name: /^Bist du dabei\?/ }).first().getByRole('button', { name: 'Ich komme' })).toHaveAttribute('aria-pressed', 'true');
	// The calendar list says which dates are answered and which still wait.
	// The list, not the filter panel's options of the same name.
	await open(page, '/kalender');
	await expect(page.getByText('Du kommst').filter({ visible: true }).first()).toBeVisible();
	await expect(page.getByText('Antwort fehlt').filter({ visible: true }).first()).toBeVisible();
});

test('the programme editor saves', async ({ page }) => {
	// EO's own programme: the editor opens on what both orchestras play together, the finale alone.
	await open(page, '/kalender/demo-herbstkonzert/programm?orchester=EO');
	const remove = page.getByRole('button', { name: 'Entfernen' });
	const before = await remove.count();
	expect(before).toBeGreaterThan(1);
	await remove.last().click();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Programm gespeichert.')).toBeVisible();
	await open(page, '/kalender/demo-herbstkonzert/programm?orchester=EO');
	await expect(page.getByRole('button', { name: 'Entfernen' })).toHaveCount(before - 1);
});

test('a new piece straight from the programme, with a guard against duplicates (#192)', async ({ page }) => {
	await open(page, '/kalender/demo-herbstkonzert/programm?orchester=EO');
	const search = page.getByRole('searchbox', { name: 'Stück suchen und hinzufügen …' });
	await search.fill('Ungarischer Tanz 5');
	await page.getByRole('button', { name: '„Ungarischer Tanz 5“ als neues Stück anlegen' }).click();
	// The piece is in the archive already, written another way.
	await expect(page.getByRole('heading', { name: 'Gibt es das Stück schon?' })).toBeVisible();
	await page.getByLabel('Titel').fill('Rosamunde');
	await page.getByLabel('Komponist').fill('Schubert');
	await page.getByRole('button', { name: 'Anlegen und hinzufügen' }).click();
	await expect(page.locator('.entries').getByText('Rosamunde')).toBeVisible();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Programm gespeichert.')).toBeVisible();
	await open(page, '/kalender/demo-herbstkonzert/programm?orchester=EO');
	await expect(page.locator('.entries').getByText('Rosamunde')).toBeVisible();
});

test('the completeness check finds a short part, which can be marked or dismissed (#93)', async ({ page }) => {
	await open(page, '/einstellungen/status');
	await page.getByRole('button', { name: 'Stimmen prüfen jetzt ausführen' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Stimmen geprüft' })).toBeVisible();

	await open(page, '/fehlende-stimmen');
	const sleigh = page.locator('.piece').filter({ hasText: 'Sleigh Ride' });
	await expect(sleigh.getByText('vielleicht unvollständig: 1 Seite, die anderen meist 3')).toBeVisible();
	await sleigh.getByRole('button', { name: 'Stimmt so' }).click();
	await expect(page.locator('.piece').filter({ hasText: 'Sleigh Ride' })).toHaveCount(0);

	// Back to the sample data: the hint is there again, and confirming it renames the file.
	await resetDemo(page);
	await open(page, '/einstellungen/status');
	await page.getByRole('button', { name: 'Stimmen prüfen jetzt ausführen' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Stimmen geprüft' })).toBeVisible();
	await open(page, '/fehlende-stimmen');
	await page.locator('.piece').filter({ hasText: 'Sleigh Ride' }).getByRole('button', { name: 'Als UNVOLLSTÄNDIG markieren' }).click();
	await expect(page.locator('.piece').filter({ hasText: 'Sleigh Ride' }).getByText('Seiten fehlen')).toBeVisible();
	await expect(page.getByText(/vielleicht unvollständig/)).toHaveCount(0);
});

test('deleting a member with all their data, after a preview (#158)', async ({ page }) => {
	await open(page, '/admin');
	await page.getByPlaceholder('Mitglieder suchen …').fill('Mia Beispiel');
	const row = page.locator('li').filter({ hasText: 'Mia Beispiel' }).first();
	await row.getByRole('button', { name: 'Bearbeiten' }).click();
	await page.getByRole('button', { name: 'Alle Daten löschen …' }).click();
	const preview = page.locator('form.erase');
	await expect(preview.getByRole('heading', { name: 'Alle Daten von Mia Beispiel löschen' })).toBeVisible();
	// Her row goes; her +1 on a wish stays, without her name.
	await expect(preview.getByText('Mitglieder')).toBeVisible();
	await expect(preview.getByText('Wünsche')).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await preview.getByRole('button', { name: 'Endgültig löschen' }).click();
	await expect(page.getByText('Die Daten von Mia Beispiel sind gelöscht.')).toBeVisible();
	await page.getByPlaceholder('Mitglieder suchen …').fill('Mia Beispiel');
	await expect(page.locator('li').filter({ hasText: 'Mia Beispiel' })).toHaveCount(0);
});

test('a retention period set on the settings page, applied by its job (#158)', async ({ page }) => {
	await open(page, '/einstellungen');
	await page.getByLabel('Namen bei Zu- und Absagen und Anwesenheit behalten für (Saisons)').fill('2');
	await page.getByRole('button', { name: 'Speichern', exact: true }).first().click();
	await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' }).first()).toBeVisible();
	await open(page, '/einstellungen');
	await expect(page.getByLabel('Namen bei Zu- und Absagen und Anwesenheit behalten für (Saisons)')).toHaveValue('2');

	await open(page, '/einstellungen/status');
	await page.getByRole('button', { name: 'Aufbewahrung jetzt ausführen' }).click();
	// The demo's rehearsals are from the last weeks: nothing is old enough yet.
	await expect(page.getByRole('status').filter({ hasText: /0 Einträge von vor dem \d{4}-09-01 ohne Namen/ })).toBeVisible();
});

test('taking attendance', async ({ page }) => {
	await open(page, '/kalender/demo-probe-2/anwesenheit');
	const boxes = page.getByRole('checkbox');
	await boxes.first().check({ force: true });
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Anwesenheit gespeichert.')).toBeVisible();
	await expect(page.getByText(/\d+ von \d+ da/)).toBeVisible();
});

test('a YouTube link is saved clean (#133)', async ({ page }) => {
	await open(page, '/stuecke/demo-egmont/bearbeiten');
	const field = page.getByLabel('Hörbeispiel');
	await field.fill('https://youtu.be/dQw4w9WgXcQ?si=Teilen123');
	await field.blur();
	await expect(field).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	// One button asks every source; the video's length ("8:30") is among the suggestions.
	await page.getByRole('button', { name: 'Automatisch ausfüllen' }).click();
	await expect(page.locator('.list').getByText(/^\d+:\d\d$/)).toBeVisible();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page).toHaveURL(/\/stuecke\/demo-egmont(\?|$)/);
	await expect(page.getByRole('link', { name: /Hörbeispiel/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('the Besetzung read from the score flags an instrument without a part (#249)', async ({ page }) => {
	await open(page, '/stuecke/demo-egmont/bearbeiten');
	await page.getByRole('button', { name: 'Automatisch ausfüllen' }).click();
	// The names at the left of the score, Italian as scores print them, in the orchestra's words,
	// filled into the empty Besetzung.
	const suggestion = page.locator('.suggest li').filter({ hasText: 'Piccolo; Flöte 1 & 2; Oboe 1 & 2' });
	await expect(suggestion).toContainText(/eingetragen|Übernehmen/);
	if (await suggestion.getByRole('button', { name: 'Übernehmen' }).isVisible()) await suggestion.getByRole('button', { name: 'Übernehmen' }).click();
	// Taken over into the instrument picker, one chip per instrument.
	const besetzung = page.getByRole('group', { name: 'Besetzung' });
	await expect(besetzung).toContainText('Piccolo');
	await expect(besetzung).toContainText('Flöte 1 & 2');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page).toHaveURL(/\/stuecke\/demo-egmont(\?|$)/);
	// No piccolo part in the archive; the double bass has its own gap (FEHLT) and isn't named twice.
	// The seating plan rings it and names it underneath.
	const missing = page.getByText(/^Ohne Stimme im Archiv:/);
	await expect(missing).toContainText('Piccolo');
	await expect(missing).not.toContainText('Kontrabass');
	await open(page, '/fehlende-stimmen');
	await expect(page.getByText('laut Besetzung, keine Stimme')).toBeVisible();
});

test('every score read at once, counted by text layer, and taken over (#249)', async ({ page }) => {
	// Reading eight scores, the scans by text recognition, is slower than a click.
	test.setTimeout(60_000);
	await open(page, '/fehlende-stimmen');
	const run = page.locator('.run');
	await run.getByRole('button', { name: 'Partituren lesen' }).click();
	// Text recognition of the scans takes its time.
	await expect(run.getByRole('button', { name: '1 Besetzung übernehmen' })).toBeVisible({ timeout: 25_000 });
	await expect(run.locator('.stats')).toContainText('8 mit Textebene');
	await expect(run.getByRole('textbox', { name: 'Egmont Ouvertüre' })).toHaveValue(/^Piccolo; Flöte 1 & 2/);
	await run.getByRole('button', { name: '1 Besetzung übernehmen' }).click();
	await expect(run.getByText('1 Besetzung gespeichert.')).toBeVisible();
	await expect(page.getByText('laut Besetzung, keine Stimme')).toBeVisible();
});

test('several composers, separated by commas', async ({ page }) => {
	await open(page, '/stuecke/demo-egmont/bearbeiten');
	await page.getByLabel('Komponist', { exact: true }).fill('Beethoven ,Mozart;');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page).toHaveURL(/\/stuecke\/demo-egmont(\?|$)/);
	// Each composer links to their works; the Mozart list now has Egmont too.
	const eyebrow = page.locator('.hero .eyebrow');
	await expect(eyebrow.getByRole('link', { name: 'Beethoven' })).toBeVisible();
	await eyebrow.getByRole('link', { name: 'Mozart' }).click();
	await expect(page).toHaveURL(/komponist=Mozart/);
	await expect(page.getByRole('link', { name: /Egmont Ouvertüre/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Eine kleine Nachtmusik/ })).toBeVisible();
});

test('settings: colour and features for everyone (#75, #134)', async ({ page }) => {
	await open(page, '/einstellungen');
	await page.getByLabel(/Standardfarbe/).uncheck();
	await page.getByRole('textbox', { name: 'Akzentfarbe' }).fill('#0f766e');
	await page.getByRole('checkbox', { name: /Leihmaterial/ }).uncheck();
	await page.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(page.getByText('Gespeichert.')).toBeVisible();
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand'))).toBe('#0f766e');
	const response = await page.goto('/leihmaterial');
	expect(response?.status()).toBe(404);
});

test('an instrument with the orchestra’s own name (#143)', async ({ page }) => {
	await open(page, '/einstellungen');
	await page.getByText('Instrumente', { exact: true }).click();
	await page.getByLabel('In der App: Viola').fill('Viola');
	await page.getByRole('button', { name: 'Instrumente speichern' }).click();
	await expect(page.getByText('Gespeichert. Gilt sofort für alle.')).toBeVisible();
	await open(page, '/meine-noten?instrument=Viola');
	await expect(page.getByText('Bratsche')).toHaveCount(0);
});

test('quick search jumps to a piece and to a page', async ({ page }) => {
	await open(page, '/');
	await page.getByRole('button', { name: 'Suchen', exact: true }).click();
	const search = page.getByRole('combobox', { name: 'Schnellsuche' });
	await search.fill('egmont');
	await expect(page.getByRole('option', { name: /Egmont/ })).toBeVisible();
	await search.press('Enter');
	await expect(page).toHaveURL(/\/stuecke\/demo-egmont/);

	await page.keyboard.press('Control+k');
	await search.fill('kalender');
	await search.press('Enter');
	await expect(page).toHaveURL(/\/kalender$/);
});

test('picking an instrument from the grid (#165)', async ({ page }) => {
	await open(page, '/meine-noten');
	const change = page.getByRole('button', { name: 'Ändern' });
	if (await change.isVisible()) await change.click();
	await page.getByRole('button', { name: /^Instrument/ }).first().click();
	await page.getByRole('searchbox', { name: 'Instrument suchen …' }).fill('cello');
	await page.getByRole('button', { name: 'Cello', exact: true }).click();
	await page.locator('form.picker').getByRole('button', { name: 'Merken' }).click();
	await expect(page.getByText('Gemerkt.')).toBeVisible();
	await expect(page.locator('.chip')).toContainText('Cello');
});

test('the current programme in Drive follows the programme (#60)', async ({ page }) => {
	// Planners keep it under "Planung". EO and A play this concert, each with its own programme
	// and folder; the finale they play together is in both.
	await open(page, '/kalender/demo-herbstkonzert?planung');
	const drive = page.locator('form.drive').first();
	const driveA = page.locator('form.drive').last();
	await expect(drive).toContainText('4 von 5 Stücken');
	await expect(driveA).toContainText('Noch kein Programmordner für A');
	// Saving EO's own programme syncs EO's folder only; A's is made by its own button.
	await open(page, '/kalender/demo-herbstkonzert/programm?orchester=EO');
	await page.getByRole('button', { name: 'Entfernen' }).last().click();
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Auch im Drive-Ordner »Aktuelles Programm« abgeglichen.')).toBeVisible();
	await open(page, '/kalender/demo-herbstkonzert?planung');
	await expect(drive).toContainText('Alle 4 Stücke');
	await expect(driveA).toContainText('Noch kein Programmordner für A');
	await drive.getByRole('button', { name: 'Abgleichen' }).click();
	await expect(drive).toContainText('Abgeglichen: 0 ergänzt, 0 herausgenommen.');
	await driveA.getByRole('button', { name: 'Abgleichen' }).click();
	await expect(driveA).toContainText('Abgeglichen: 3 ergänzt, 0 herausgenommen.');
});

test('a date poll from start to calendar (#95)', async ({ page }) => {
	await open(page, '/termine');
	await page.getByText('Neue Umfrage').click();
	await page.getByLabel('Worum geht es?').fill('Sommerfest');
	const dates = page.locator('input[name="date"]');
	await dates.nth(0).fill('2027-07-03');
	await dates.nth(1).fill('2027-07-10');
	await page.locator('input[name="start"]').nth(1).fill('18:00');
	await page.getByRole('checkbox', { name: 'Orga' }).check();
	await page.getByRole('button', { name: 'Umfrage starten' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Sommerfest' })).toBeVisible();

	await page.getByRole('group', { name: /10\. Juli 2027/ }).getByRole('radio', { name: 'Ja' }).check();
	await page.getByRole('group', { name: /3\. Juli 2027/ }).getByRole('radio', { name: 'Vielleicht' }).check();
	await page.getByRole('button', { name: 'Antwort speichern' }).click();
	await expect(page.getByText('Antwort gespeichert.')).toBeVisible();
	await expect(page.getByText('Bester Termin')).toBeVisible();

	// The best date is ticked; a second one can join it (#209).
	await expect(page.getByRole('checkbox', { name: /Nehmen \(Samstag, 10\. Juli 2027/ })).toBeChecked();
	await page.getByRole('checkbox', { name: /Nehmen \(Samstag, 3\. Juli 2027/ }).check();
	await page.getByRole('button', { name: 'Mit 2 Terminen abschließen' }).click();
	const links = page.getByRole('link', { name: /In Google Kalender eintragen/ });
	await expect(links).toHaveCount(2);
	await expect(links.nth(1)).toHaveAttribute('href', /dates=20270710T180000/);
});

test('a note on a piece reaches the section’s Meine Noten (#125)', async ({ page }) => {
	await open(page, '/stuecke/demo-morgenstimmung');
	await page.getByText('Hinweis hinzufügen').click();
	await page.getByRole('textbox', { name: 'Hinweis' }).fill('Takt 12 bis 20 nur die Hälfte der Geigen');
	await page.locator('select[name="section"]').selectOption('Streicher');
	await page.getByRole('button', { name: 'Speichern', exact: true }).click();
	await expect(page.getByText('Hinweis gespeichert.')).toBeVisible();
	await expect(page.getByText('Für Streicher').first()).toBeVisible();
	// Mia plays Geige II: the note shows next to her part.
	await resetDemo(page, 'mitglied');
	await open(page, '/meine-noten');
	await expect(page.getByText('Takt 82–96: Bogen ab Saite, kurz und leicht.').first()).toBeVisible();
	await open(page, '/meine-noten?instrument=Flöte');
	await expect(page.getByText('Takt 82–96: Bogen ab Saite, kurz und leicht.')).toHaveCount(0);
	await expect(page.getByText('Ohne Wiederholung der Exposition').first()).toBeVisible();
});

test('a rehearsal note shows on the start page until the next rehearsal (#145)', async ({ page }) => {
	await open(page, '/kalender/demo-probe-2');
	await page.getByRole('button', { name: 'Notiz bearbeiten' }).click();
	await page.getByRole('textbox', { name: 'Zum Üben' }).fill('Egmont ab Buchstabe C langsam');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByText('Notiz gespeichert.')).toBeVisible();
	await open(page, '/');
	await expect(page.getByText(/Aus der Probe am/)).toBeVisible();
	await expect(page.getByText('Egmont ab Buchstabe C langsam')).toBeVisible();
	// Before the next rehearsal, its page says what to prepare.
	await open(page, '/kalender/demo-probe-3');
	await expect(page.getByRole('heading', { name: /Aus der letzten Probe/ })).toBeVisible();
	await expect(page.getByText('Egmont ab Buchstabe C langsam')).toBeVisible();
});

test('a member downloads their own data (#158)', async ({ page }) => {
	await resetDemo(page, 'mitglied');
	await open(page, '/profil');
	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Meine Daten herunterladen' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe('meine-daten-mia-example-org.json');
	const body = await (await page.request.get('/profil/daten.json')).json();
	expect(body.email).toBe('mia@example.org');
	expect(body.data['Mitglieder'][0]['Name']).toBe('Mia Beispiel');
	// Who else gave a wish a +1 stays out.
	expect(JSON.stringify(body)).not.toContain('lea@example.org');
});

test.describe('installing from Samsung Internet', () => {
	test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36' });

	test('points to Chrome, whose install Android does not warn about', async ({ page }) => {
		await open(page, '/install');
		await expect(page.getByRole('radio', { name: 'Android' })).toBeChecked();
		await expect(page.getByText('Am besten öffnest du die Seite in Chrome')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Jetzt installieren' })).toHaveCount(0);
	});
});
