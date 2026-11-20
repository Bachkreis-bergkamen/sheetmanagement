export const pwa = {
	description: 'Noten, Proben und Konzerte des Orchesters, auch offline im Probenraum.',
	offline: 'Offline: Du siehst die zuletzt geladene Fassung. Offline gespeicherte Noten lassen sich öffnen.',
	save: 'Offline speichern',
	saving: (done: number, total: number) => `Speichere ${done} von ${total} …`,
	saved: (n: number) => (n === 1 ? '1 Stimme offline gespeichert' : `${n} Stimmen offline gespeichert`),
	update: 'Offline-Kopie erneuern',
	newVersion: 'Neue Version verfügbar',
	reload: 'Neu laden',
	remove: 'Offline-Kopie löschen',
	failed: (n: number) => (n === 1 ? '1 Stimme ließ sich nicht speichern.' : `${n} Stimmen ließen sich nicht speichern.`),
	hint: 'Deine Stimmen auf diesem Gerät, für den Probenraum ohne Netz.',
	unsupported: 'Dieser Browser kann Noten nicht offline speichern.',
	offlineBadge: 'offline da',
	savePart: (label: string) => `${label} offline speichern`,
	removePart: (label: string) => `${label}: Offline-Kopie löschen`,
	shelf: {
		title: 'Offline auf diesem Gerät',
		lead: 'Diese Stimmen öffnen sich auch ohne Netz. Speichern kannst du jede Stimme auf der Seite ihres Stücks.',
		count: (n: number) => (n === 1 ? '1 Stimme' : `${n} Stimmen`),
		view: (label: string) => `${label} zum Üben öffnen`,
		removeAll: 'Alle löschen',
		confirmRemoveAll: 'Alle offline gespeicherten Stimmen von diesem Gerät löschen?'
	}
} as const;
