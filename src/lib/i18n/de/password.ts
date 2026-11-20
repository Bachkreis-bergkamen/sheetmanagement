/** Email and password sign-in: the form on /anmelden, signing up and resetting by email, the profile. */
export const password = {
	email: 'E-Mail-Adresse',
	password: 'Passwort',
	signIn: 'Anmelden',
	signInErrors: {
		wrong: 'E-Mail-Adresse oder Passwort stimmt nicht.',
		limited: 'Zu viele Versuche. Bitte in einer Viertelstunde noch einmal.',
		failed: 'Das hat gerade nicht geklappt. Bitte versuch es noch einmal.'
	} as Record<string, string>,
	createOrReset: 'Konto anlegen oder Passwort vergessen?',
	noMailHint: 'Noch kein Passwort? Lass dir von der Verwaltung einen persönlichen Link geben und leg im Profil ein Passwort fest.',
	requestTitle: 'Passwort festlegen',
	requestLead: 'Für ein neues Konto oder wenn du dein Passwort vergessen hast: Wir schicken dir einen Link, mit dem du ein Passwort festlegst.',
	send: 'Link per E-Mail schicken',
	sent: (email: string) => `Wir haben einen Link an ${email} geschickt. Er gilt eine Stunde. Schau auch im Spam-Ordner nach.`,
	mailErrors: {
		invalid: 'Bitte eine E-Mail-Adresse eingeben.',
		limited: 'Zu viele Versuche. Bitte in einer Stunde noch einmal.',
		failed: 'Das hat gerade nicht geklappt. Bitte versuch es noch einmal.'
	} as Record<string, string>,
	noMail: 'Gerade können keine E-Mails verschickt werden. Bitte frag die Verwaltung nach einem persönlichen Link; danach kannst du im Profil ein Passwort festlegen.',
	toSignIn: 'Zur Anmeldung',
	newSubject: (orchestra: string) => `Dein Konto: ${orchestra}`,
	newBody: (name: string, orchestra: string, link: string) =>
		`Hallo${name ? ` ${name}` : ''},\n\nmit diesem Link legst du dein Passwort für ${orchestra} fest. Er gilt eine Stunde:\n\n${link}\n\nDu wolltest kein Konto anlegen? Dann lösch diese E-Mail einfach.`,
	resetSubject: (orchestra: string) => `Neues Passwort: ${orchestra}`,
	resetBody: (name: string, link: string) =>
		`Hallo${name ? ` ${name}` : ''},\n\nmit diesem Link legst du ein neues Passwort fest. Er gilt eine Stunde und nur einmal:\n\n${link}\n\nDu hast kein neues Passwort angefordert? Dann lösch diese E-Mail einfach; dein Passwort bleibt, wie es ist.`,
	setTitle: 'Passwort festlegen',
	resetTitle: 'Neues Passwort',
	setLead: (email: string) => `Für ${email}.`,
	newPassword: 'Neues Passwort',
	repeat: 'Noch einmal',
	current: 'Bisheriges Passwort',
	rule: (min: number) => `Mindestens ${min} Zeichen. Ein Satz, den du dir merken kannst, ist besser als ein kurzes kompliziertes Wort.`,
	problems: {
		short: 'Das Passwort ist zu kurz.',
		long: 'Das Passwort ist zu lang.',
		mismatch: 'Die beiden Passwörter sind nicht gleich.'
	} as Record<string, string>,
	save: 'Passwort speichern',
	failed: 'Das Passwort konnte gerade nicht gespeichert werden. Bitte versuch es noch einmal.',
	linkInvalid: 'Dieser Link ist abgelaufen oder wurde schon benutzt.',
	newLink: 'Neuen Link anfordern',
	profileTitle: 'Passwort',
	profileHas: (email: string) => `Du kannst dich mit ${email} und deinem Passwort anmelden. Ein neues Passwort meldet dich überall sonst ab.`,
	profileNone: (email: string) => `Leg ein Passwort fest, dann meldest du dich auch mit ${email} und Passwort an.`,
	set: 'Passwort festlegen',
	change: 'Passwort ändern',
	saved: 'Passwort gespeichert.',
	wrongCurrent: 'Das bisherige Passwort stimmt nicht.',
	forgot: 'Passwort vergessen?'
} as const;
