export const currentProgram = {
	title: 'Aktuelles Programm im Drive',
	sync: 'Abgleichen',
	noFolder: (name: string) => `Noch kein Programmordner für ${name} – Abgleichen legt die Verknüpfungen an.`,
	complete: (count: number, folder: string) => `Alle ${count} Stücke liegen im Programmordner »${folder}«.`,
	partly: (linked: number, total: number, folder: string) => `${linked} von ${total} Stücken liegen im Programmordner »${folder}«.`,
	extra: (count: number) => (count === 1 ? '1 anderes Stück liegt noch drin.' : `${count} andere Stücke liegen noch drin.`),
	notNext: 'Nicht das nächste Konzert dieses Orchesters.',
	done: (added: number, removed: number) => `Abgeglichen: ${added} ergänzt, ${removed} herausgenommen.`,
	removedHint: 'Herausgenommene Verknüpfungen liegen im Papierkorb.',
	stuck: (names: string[]) => `${names.map((name) => `»${name}«`).join(', ')} kann nur herausnehmen, wer die Verknüpfung angelegt hat: bitte von Hand im Drive löschen.`,
	open: 'Ordner öffnen',
	failed: 'Abgleichen hat nicht geklappt. Hat das Dienstkonto Bearbeitungsrechte für den Ordner?',
	ambiguous: 'Mehrere Programmordner und kein Orchester am Konzert: bitte in der Tabelle das Orchester eintragen.',
	none: 'Für dieses Orchester gibt es keinen Programmordner, und DRIVE_CURRENT_PROGRAM_FOLDER_ID nennt keinen Ordner, in dem einer entstehen kann.',
	autoDone: 'Auch im Drive-Ordner »Aktuelles Programm« abgeglichen.',
	autoFailed: 'Im Drive-Ordner »Aktuelles Programm« konnte das Programm nicht abgeglichen werden.'
} as const;
