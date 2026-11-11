import { expect, expectAccessible, open, resetDemo, test } from './demo.ts';

/** The main pages open, show what they're for, and pass the accessibility check (#141, #142). */
test.beforeEach(async ({ page }) => resetDemo(page));

test('start page: greeting, open work and the next dates', async ({ page }) => {
	await open(page, '/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Hallo');
	await expect(page.getByRole('region', { name: 'Wartet auf dich' })).toContainText('Dinge warten auf dich');
	// The next date is the heading; what follows comes after it.
	await expect(page.getByRole('region', { name: 'Als Nächstes' }).getByRole('heading', { level: 2 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Danach' })).toBeVisible();
	// Nothing wider than the screen: on a phone that widens the page, and taps land beside their buttons.
	expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
	await expectAccessible(page);
});

test('everything waiting in one list (#185)', async ({ page }) => {
	await open(page, '/');
	await page.getByRole('region', { name: 'Wartet auf dich' }).getByRole('link').click();
	await expect(page).toHaveURL(/\/zu-erledigen$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Zu erledigen' })).toBeVisible();
	const reports = page.getByRole('region', { name: /^Meldungen/ });
	await expect(reports.getByRole('link')).toHaveCount(2);
	await expect(page.getByRole('region', { name: /^Zugangsanfragen/ })).toContainText('Nele Neu');
	await expectAccessible(page);

	// The organisers' area leads there too, and lists its groups.
	await open(page, '/verwaltung');
	await expect(page.getByRole('link', { name: /Zu erledigen/ })).toContainText('Dinge warten');
	await expect(page.getByRole('heading', { name: 'Noten pflegen' })).toBeVisible();
	await expectAccessible(page);
});

test('concert page with the programme', async ({ page }) => {
	await open(page, '/kalender/demo-herbstkonzert');
	await expect(page.getByRole('heading', { level: 1, name: 'Herbstkonzert' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Bist du dabei?' })).toBeVisible();
	await expect(page.getByText('Egmont Ouvertüre').first()).toBeVisible();
	await expectAccessible(page);
});

test('archive and a piece', async ({ page }) => {
	await open(page, '/stuecke');
	await page.getByRole('link', { name: /Egmont Ouvertüre/ }).click();
	await expect(page).toHaveURL(/\/stuecke\/demo-egmont$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Egmont Ouvertüre' })).toBeVisible();
	await expectAccessible(page);
});

test('Meine Noten for a member', async ({ page }) => {
	await resetDemo(page, 'mitglied');
	await open(page, '/meine-noten');
	await expect(page.getByRole('heading', { level: 1, name: 'Meine Noten' })).toBeVisible();
	await expect(page.getByRole('heading', { name: /Herbstkonzert/ }).first()).toBeVisible();
	await expectAccessible(page);
});

test('workspace tabs count open work (#139)', async ({ page }) => {
	await open(page, '/meldungen');
	const tabs = page.getByRole('navigation', { name: 'Noten pflegen' });
	await expect(tabs.getByRole('link', { name: /Meldungen\s*2 offen/ })).toBeVisible();
	await expectAccessible(page);
});

test('the "Mehr" menu takes and returns focus', async ({ page }) => {
	await open(page, '/stuecke');
	const more = page.getByRole('button', { name: 'Mehr' }).filter({ visible: true });
	await more.click();
	const menu = page.getByRole('dialog', { name: 'Alle Seiten' });
	await expect(menu).toBeVisible();
	await expect(menu.locator(':focus')).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(more).toBeFocused();
});

test('settings page', async ({ page }) => {
	await open(page, '/einstellungen');
	await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Funktionen' })).toBeVisible();
	await expectAccessible(page);

	// Every setting in one place (#185): the sheet and the status are sections of it.
	const sections = page.getByRole('navigation', { name: 'Bereiche der Einstellungen' });
	await expect(sections.getByRole('link')).toHaveText(['Orchester', 'Tabelle & Daten', 'Status']);
	await sections.getByRole('link', { name: 'Status' }).click();
	await expect(page).toHaveURL(/\/einstellungen\/status$/);
	await expect(sections.getByRole('link', { name: 'Status' })).toHaveAttribute('aria-current', 'page');

	// The old addresses keep working.
	await open(page, '/setup');
	await expect(page).toHaveURL(/\/einstellungen\/tabelle$/);
});

test('date polls: only for their groups (#95)', async ({ page }) => {
	await open(page, '/termine');
	await expect(page.getByRole('heading', { level: 1, name: 'Terminumfragen' })).toBeVisible();
	await page.getByRole('link', { name: /Probenwochenende/ }).click();
	await expect(page.getByText('Bester Termin')).toBeVisible();
	await expectAccessible(page);

	// A member outside Orga, Dirigat and Vorstand sees neither the entry nor the poll.
	const url = page.url();
	await resetDemo(page, 'mitglied');
	await open(page, '/termine');
	await expect(page.getByText('Gerade läuft keine Umfrage für dich.')).toBeVisible();
	const response = await page.goto(url);
	expect(response?.status()).toBe(404);
});

test('Chronik: the timeline and the numbers (#61)', async ({ page }) => {
	await open(page, '/chronik');
	await expect(page.getByRole('heading', { level: 1, name: 'Chronik' })).toBeVisible();
	await expect(page.getByText('1960er')).toBeVisible();
	await expectAccessible(page);
	await page.getByRole('radio', { name: 'In Zahlen' }).click();
	await expect(page.getByRole('heading', { name: 'Am häufigsten gespielt' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lange nicht gespielt' })).toBeVisible();
	await expectAccessible(page);
});

test('season report for the annual meeting (#147)', async ({ page }) => {
	await open(page, '/chronik');
	await page.getByRole('link', { name: 'Saisonbericht' }).click();
	await expect(page.getByRole('heading', { level: 1, name: /Saisonbericht/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Zum ersten Mal gespielt' })).toBeVisible();
	await expectAccessible(page);
});

test('a rehearsal with its note, and the profile with the data download', async ({ page }) => {
	await open(page, '/kalender/demo-probe-2');
	await expect(page.getByRole('heading', { name: 'Aus der Probe' })).toBeVisible();
	await expectAccessible(page);
	await open(page, '/profil');
	await expect(page.getByRole('link', { name: 'Meine Daten herunterladen' })).toBeVisible();
	await expectAccessible(page);
});
