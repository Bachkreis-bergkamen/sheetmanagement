import type { Page } from '@playwright/test';
import { expect, expectAccessible, open, resetDemo, test } from './demo.ts';

/** The tour for new members: offered once, step by step through the main pages and the profile. */
test.beforeEach(async ({ page }) => resetDemo(page, 'mitglied', { tour: true }));

const card = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

test('taking the tour, and taking it again from the profile', async ({ page }) => {
	await open(page, '/');
	await expect(card(page, 'Willkommen, Mia!')).toBeVisible();
	await expectAccessible(page);
	await page.getByRole('button', { name: 'Tour starten' }).click();

	// The essentials, each step on its page, with the focus on the card for keyboards and screen readers.
	const basics = [
		['/', 'Dein nächster Termin'],
		['/meine-noten', 'Meine Noten'],
		['/kalender', 'Kalender'],
		['/stuecke', 'Archiv'],
		['/stuecke', 'Mehr']
	] as const;
	for (const [index, [path, title]] of basics.entries()) {
		const step = card(page, title);
		await expect(step).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
		await expect(step.getByText(`Schritt ${index + 1} von 5`)).toBeVisible();
		await expect(step.getByRole('heading', { name: title })).toBeFocused();
		await step.getByRole('button', { name: 'Weiter' }).click();
	}

	// A pause: setting up is offered, with what it holds.
	const pause = card(page, 'Das Wichtigste kennst du');
	await expect(pause.getByRole('listitem')).toContainText(['Dein Instrument', 'Ansicht und Schrift']);
	await pause.getByRole('button', { name: 'Einrichten' }).click();

	// Notifications only where they're set up; the demo has none, so that step is left out.
	const setup = [
		['/profil', 'Dein Instrument'],
		['/profil', 'Ansicht und Schrift'],
		['/profil', 'Aufs Handy']
	] as const;
	for (const [index, [path, title]] of setup.entries()) {
		const step = card(page, title);
		await expect(step).toBeVisible();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
		await expect(step.getByText(`Schritt ${index + 1} von 4`)).toBeVisible();
		await step.getByRole('button', { name: 'Weiter' }).click();
	}
	const last = card(page, 'Fertig!');
	await expect(last).toBeVisible();
	await expectAccessible(page);
	await last.getByRole('button', { name: 'Fertig' }).click();
	await expect(last).toBeHidden();

	// Not offered again, also after reloading.
	await open(page, '/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Hallo');
	await expect(card(page, /Willkommen/)).toHaveCount(0);

	await open(page, '/profil');
	await page.getByRole('button', { name: 'Tour noch einmal machen' }).click();
	await expect(card(page, 'Dein nächster Termin')).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
});

test('skipping the tour, at the start or at any step', async ({ page }) => {
	// Offered on the start page only, so it never covers another page.
	await open(page, '/kalender');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Kalender');
	await expect(card(page, /Willkommen/)).toHaveCount(0);
	await open(page, '/');
	await card(page, 'Willkommen, Mia!').getByRole('button', { name: 'Überspringen' }).click();
	await expect(card(page, /Willkommen/)).toBeHidden();
	await open(page, '/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Hallo');
	await expect(card(page, /Willkommen/)).toHaveCount(0);

	// Started again and ended with Escape: the page keeps going, the focus back on it.
	await open(page, '/profil');
	await page.getByRole('button', { name: 'Tour noch einmal machen' }).click();
	await page.getByRole('button', { name: 'Weiter' }).click();
	await expect(card(page, 'Meine Noten')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(card(page, 'Meine Noten')).toBeHidden();
	await expect(page.locator('main')).toBeFocused();
});
