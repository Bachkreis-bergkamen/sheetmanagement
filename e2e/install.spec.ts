import { expect, expectAccessible, open, resetDemo, test } from './demo.ts';

/** The app on the home screen (#279): the guide on /install, the start page's hint, the profile's entry. */
test.beforeEach(async ({ page }) => resetDemo(page, 'mitglied'));

test('the guide, one step at a time, for the device it’s opened on', async ({ page }, testInfo) => {
	await open(page, '/install');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Muster auf deinem Handy');
	await expectAccessible(page);

	// The phone is an Android, the desktop a computer; each sees its own steps.
	const phone = testInfo.project.name === 'phone';
	await expect(page.getByRole('radio', { name: phone ? 'Android' : 'Computer' })).toBeChecked();
	const steps = phone ? ['Öffne das Menü', '„App installieren“ wählen', 'Auf „Installieren“ tippen'] : ['Auf das Installieren-Symbol klicken', 'Auf „Installieren“ klicken'];
	for (const [index, title] of steps.entries()) {
		await expect(page.getByRole('heading', { name: title })).toBeVisible();
		await expect(page.getByText(`Schritt ${index + 1} von ${steps.length}`)).toBeVisible();
		await page.getByRole('button', { name: index === steps.length - 1 ? 'Erledigt' : 'Weiter' }).click();
	}
	// Nothing here can see the home screen: no "Geschafft!" without the browser saying so.
	await expect(page.getByRole('heading', { name: 'Schau auf deinen Startbildschirm' })).toBeFocused();
	await expect(page.getByText('Geschafft!')).toHaveCount(0);

	// The iPhone's steps are a tap away, e.g. for helping someone else.
	await page.getByRole('radio', { name: 'iPhone, iPad' }).click();
	await expect(page.getByRole('heading', { name: 'Tippe auf „Teilen“' })).toBeVisible();
	await expect(page.getByText('Kommst du aus WhatsApp?')).toBeVisible();
});

test('installed: no hint, and the guide says so', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('installed', '1'));
	await open(page, '/install');
	await expect(page.getByRole('heading', { name: 'Geschafft!' })).toBeVisible();
	await open(page, '/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Hallo');
	await expect(page.getByRole('complementary', { name: /Installiere/ })).toHaveCount(0);
});

test('the start page asks on phones, and “Später” is remembered', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'phone', 'Only phones are asked.');
	await open(page, '/');
	const hint = page.getByRole('complementary', { name: 'Installiere die Muster-App' });
	await expect(hint).toBeVisible();
	await hint.getByRole('button', { name: 'Später' }).click();
	await expect(hint).toBeHidden();
	await open(page, '/');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('Hallo');
	await expect(hint).toHaveCount(0);

	// The way to the guide stays on the profile.
	await open(page, '/profil');
	await page.getByRole('link', { name: /Muster auf deinem Handy/ }).click();
	await expect(page).toHaveURL(/\/install$/);
});
