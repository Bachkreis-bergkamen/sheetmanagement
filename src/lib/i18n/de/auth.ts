export const auth = {
	title: 'Anmelden',
	lead: 'Melde dich an, um Noten, Konzerte und Programme zu sehen.',
	button: 'Mit Google anmelden',
	privacy: 'Die App erfährt dabei nur deinen Namen und deine E-Mail-Adresse.',
	notReady: 'Die Anmeldung ist noch nicht fertig eingerichtet:',
	errors: {
		abgebrochen: 'Die Anmeldung wurde abgebrochen.',
		abgelaufen: 'Die Anmeldung ist abgelaufen. Bitte versuch es noch einmal.',
		konto: 'Dieses Google-Konto hat keine bestätigte E-Mail-Adresse.',
		google: 'Google hat die Anmeldung gerade nicht bestätigt. Bitte versuch es noch einmal.',
		oidc: 'Die Anmeldung beim Anbieter hat gerade nicht geklappt. Bitte versuch es noch einmal.',
		'oidc-konto': 'Dieses Konto hat keine bestätigte E-Mail-Adresse. Bitte melde dich anders an.'
	} as Record<string, string>,
	/** The school's or another OpenID Connect sign-in (#190). */
	oidc: {
		button: (label: string) => `Mit ${label} anmelden`,
		defaultLabel: 'dem Schulkonto',
		issuerNotHttps: 'OIDC_ISSUER muss eine https-Adresse sein.'
	},
	signedInAs: (email: string) => `Angemeldet als ${email}`,
	logout: 'Abmelden',
	switchAccount: 'Mit einem anderen Konto anmelden',
	/** Several accounts on one device (an admin's and a member's, a shared tablet). */
	accounts: {
		title: 'Konten auf diesem Gerät',
		lead: 'Ohne neue Anmeldung zwischen Konten wechseln, z. B. auf einem geteilten Gerät.',
		add: 'Weiteres Konto hinzufügen',
		switchTo: 'Wechseln',
		forget: 'Entfernen',
		forgetConfirm: (name: string) => `${name} von diesem Gerät entfernen?`,
		current: 'Aktiv',
		onDevice: 'Auf diesem Gerät gespeichert'
	}
} as const;
