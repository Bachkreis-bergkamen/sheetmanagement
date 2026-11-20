export const accessLink = {
	title: 'Zugang per Link',
	hello: (name: string) => (name ? `Hallo ${name}!` : 'Hallo!'),
	lead: 'Mit diesem persönlichen Link meldest du dich ohne Passwort an.',
	signIn: 'Anmelden',
	keep: 'Bewahre den Link gut auf und gib ihn nicht weiter. Er gilt, bis du (im Profil) oder die Verwaltung einen neuen erzeugt.',
	invalid: 'Dieser Link gilt nicht mehr. Bitte frag die Verwaltung nach einem neuen.',
	toSignIn: 'Zur Anmeldung'
} as const;
