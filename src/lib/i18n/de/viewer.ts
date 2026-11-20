export const viewer = {
	show: 'Noten ansehen',
	hide: 'Noten ausblenden',
	page: (page: number, pages: number) => `Seite ${page} von ${pages}`,
	previous: 'Vorige Seite',
	next: 'Nächste Seite',
	larger: 'Größer',
	smaller: 'Kleiner',
	open: 'In neuem Tab öffnen',
	loading: 'Lade die Noten …',
	hint: 'Angaben von der Seite abtippen, oder im neuen Tab markieren und kopieren.'
} as const;
