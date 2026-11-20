export const access = {
	title: 'Zugang beantragen',
	hello: (name: string) => `Hallo ${name}!`,
	lead: 'Du bist angemeldet, aber noch nicht als Mitglied freigeschaltet.',
	request: 'Zugang beantragen',
	nameLabel: 'Vor- und Nachname',
	surnameNeeded: 'Bitte Vor- und Nachnamen angeben, damit die Verwaltung dich zuordnen kann.',
	requested: 'Deine Anfrage ist angekommen. Sobald sie bestätigt ist, kannst du die App nutzen. Lade die Seite dann neu.',
	unavailable: 'Anfragen sind gerade nicht möglich. Bitte melde dich direkt beim Vorstand.'
} as const;
