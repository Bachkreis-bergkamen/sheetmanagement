/** Moving the data from the sheet into D1 and back (#186). */
export const dataMove = {
	title: 'Datenbank',
	lead: 'Wo die Daten liegen, die ihr pflegt: Stücke, Konzerte, Programme, Mitglieder, Rechte, Anmeldungen, Leihmaterial, Notizen und Einstellungen.',
	sourceSheet: 'Die Google-Tabelle ist die Quelle. Jede Seite liest sie, jede Änderung geht hinein.',
	sourceD1: 'Die Datenbank (D1) ist die Quelle. Die Tabelle ist eine Kopie, die jede Nacht neu geschrieben wird; Änderungen dort gehen beim nächsten Export verloren.',
	noD1: 'Ohne D1-Datenbank bleibt die Tabelle die Quelle. Die DB-Bindung in wrangler.toml anlegen, siehe README.',
	preview: 'Was übernommen würde',
	previewLead: 'Gelesen gerade eben aus der Tabelle. Nichts ist geändert, bis du übernimmst.',
	tabRows: (tab: string, rows: number) => `${tab}: ${rows === 1 ? '1 Zeile' : `${rows} Zeilen`}`,
	unknown: (columns: string) => `Spalten, die die App nicht kennt und nicht übernimmt: ${columns}`,
	missing: (columns: string) => `Fehlende Spalten, danach leer: ${columns}`,
	total: (rows: number, tabs: number) => `${rows} Zeilen aus ${tabs} Blättern.`,
	importButton: 'Aus Tabelle übernehmen',
	importConfirm: 'Alle Daten aus der Tabelle in die Datenbank übernehmen? Danach ist die Tabelle nur noch eine Kopie; was dort jemand ändert, geht verloren.',
	imported: (rows: number, tabs: number) => `Übernommen: ${rows} Zeilen aus ${tabs} Blättern. Die Datenbank ist jetzt die Quelle.`,
	exportButton: 'Jetzt in die Tabelle schreiben',
	exported: (rows: number, tabs: number) => `In die Tabelle geschrieben: ${rows} Zeilen in ${tabs} Blättern.`,
	backButton: 'Zurück zur Tabelle',
	backConfirm: 'Die Tabelle wieder zur Quelle machen? Vorher wird alles aus der Datenbank hineingeschrieben.',
	back: 'Die Tabelle ist wieder die Quelle.',
	download: 'Alles herunterladen (JSON)',
	restoreTitle: 'Aus einer Sicherung wiederherstellen',
	restoreLead: 'Eine Datei von „Alles herunterladen“ oder eine Sicherung aus Drive. Ersetzt alles in der Datenbank und macht sie zur Quelle.',
	restoreFile: 'Sicherung (JSON)',
	restoreButton: 'Wiederherstellen',
	restoreConfirm: 'Alles in der Datenbank durch diese Sicherung ersetzen? Was seitdem geändert wurde, geht verloren.',
	restoreNoFile: 'Bitte eine Sicherungsdatei wählen.',
	restoreTooLarge: 'Die Datei ist zu groß für eine Sicherung dieser App.',
	restoreNotBackup: 'Das ist keine Sicherung dieser App.',
	restored: (rows: number, tabs: number, skipped: number) =>
		`Wiederhergestellt: ${rows} Zeilen aus ${tabs} Blättern${skipped ? `; ${skipped} ${skipped === 1 ? 'Zeile passte nicht und fehlt' : 'Zeilen passten nicht und fehlen'}` : ''}. Die Datenbank ist die Quelle.`,
	failed: (message: string) => `Hat nicht geklappt: ${message}`,
	backup: 'Sicherung: D1 kann 30 Tage zurückgesetzt werden (Time Travel), die Tabelle ist jede Nacht eine Kopie außerhalb von Cloudflare, und mit DRIVE_BACKUP_FOLDER_ID liegt jede Woche eine Datei mit allem in Drive (die letzten 8).',
	statusD1: (rows: number) => `Quelle: Datenbank, ${rows} Zeilen; die Tabelle ist eine Kopie`,
	exportSheetOff: 'Die Tabelle ist die Quelle; nichts zu exportieren.',
	exportUnchanged: 'Seit dem letzten Export nichts geändert; die Tabelle ist aktuell.',
	backupSheetSource: 'Die Tabelle ist die Quelle; Drive hält ihre Versionen selbst.',
	backupOff: 'DRIVE_BACKUP_FOLDER_ID ist nicht gesetzt; keine Sicherung in Drive.',
	backupNoAccount: 'Kein Drive-Konto zum Schreiben: auf Status das Drive-Konto verbinden, oder DRIVE_WRITE für einen geteilten Ordner.',
	backedUp: (name: string, rows: number, trashed: number) =>
		`${name} mit ${rows} Zeilen in Drive gesichert${trashed ? `; ${trashed} ${trashed === 1 ? 'alte Sicherung' : 'alte Sicherungen'} im Papierkorb` : ''}.`,
	/** Why the database refused a save (#186). */
	refused: {
		link: (tab: string, column: string, value: string) => `${tab}, ${column}: „${value}“ gibt es nicht. Erst anlegen, dann hier eintragen.`,
		unique: (tab: string, column: string, value: string) => `${tab}, ${column}: ${value ? `„${value}“` : 'Das'} gibt es schon.`,
		required: (tab: string, column: string) => `${tab}: ${column} fehlt.`,
		used: (tab: string) => `${tab}: Das wird noch gebraucht, z. B. in einem Programm. Erst dort entfernen.`
	},
	skippedTitle: 'Wird nicht übernommen',
	skippedLead: 'Diese Zeilen übergeht die App schon heute; sie bleiben in der Tabelle, kommen aber nicht in die Datenbank.',
	skipped: {
		link: (tab: string, row: number, column: string, value: string) => `${tab}, Zeile ${row}: ${column} „${value}“ gibt es nicht`,
		unique: (tab: string, row: number, column: string, value: string) => `${tab}, Zeile ${row}: ${column} „${value}“ doppelt`,
		required: (tab: string, row: number, column: string) => `${tab}, Zeile ${row}: ${column} fehlt`,
		used: (tab: string, row: number) => `${tab}, Zeile ${row}: wird noch gebraucht`
	}
} as const;
