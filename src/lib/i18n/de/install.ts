/** The install guide's steps (#279): a list, not a fixed tuple, so other languages may differ. */
export type InstallSteps = { title: string; body: string }[];

/** The app on the home screen (#279): the start page's hint, /install and the profile's entry. */
export const install = {
	title: (name: string) => `${name} auf deinem Handy`,
	entryHint: 'Installation und Hilfe',
	entryInstalled: 'Installiert · Anleitung und Hilfe',
	pageTitle: 'App installieren',
	lead: (name: string) => `Leg ${name} auf deinen Startbildschirm. Dann öffnet es sich mit einem Tipp, wie jede andere App.`,
	shareDescription: 'Noten, Proben und Konzerte als App auf dem Handy, in einer Minute eingerichtet.',
	benefits: {
		parts: { title: 'Deine Noten mit einem Tipp', body: 'Termine und Stimmen öffnen sich sofort, ohne Suchen im Browser.' },
		offline: { title: 'Auch ohne Netz', body: 'Gespeicherte Stimmen und zuletzt geöffnete Seiten gehen im Probenraum ohne Empfang.' },
		reminders: { title: 'Erinnerungen', body: 'Auf dem iPhone gibt es Benachrichtigungen nur für die App auf dem Startbildschirm.' }
	},
	hint: {
		title: (name: string) => `Installiere die ${name}-App`,
		body: 'Deine Noten, Termine und Konzertinformationen, jederzeit griffbereit.',
		install: 'Jetzt installieren',
		later: 'Später',
		never: 'Nicht mehr fragen'
	},
	device: 'Dein Gerät',
	platforms: { ios: 'iPhone, iPad', android: 'Android', desktop: 'Computer' },
	oneTap: {
		title: 'Mit einem Tipp installieren',
		body: 'Dein Browser kann die App direkt installieren. Er fragt einmal nach, dann liegt sie auf deinem Startbildschirm.',
		button: 'Jetzt installieren',
		manual: 'Lieber Schritt für Schritt'
	},
	step: (n: number, of: number) => `Schritt ${n} von ${of}`,
	back: 'Zurück',
	next: 'Weiter',
	finish: 'Erledigt',
	restart: 'Noch einmal von vorn',
	notSafari: 'Auf dem iPhone klappt das am sichersten in Safari. Kopiere den Link und öffne ihn dort.',
	fromApp: 'Kommst du aus WhatsApp? Tippe unten rechts auf das Kompass-Symbol oder auf „In Safari öffnen“.',
	otherAndroid: 'Diese Seite ist im Browser einer anderen App offen. Tippe auf die drei Punkte und „Im Browser öffnen“, dann geht es in Chrome weiter.',
	samsung: 'Samsung Internet warnt beim Installieren vor einer alten Android-Version; das liegt am Browser, nicht an der App. Am besten öffnest du die Seite in Chrome.',
	firefox: 'Firefox kann Web-Apps auf dem Computer nicht installieren. Öffne die Seite in Chrome oder Edge, oder leg dir ein Lesezeichen an.',
	copyLink: 'Link kopieren',
	copied: 'Kopiert',
	steps: {
		ios: [
			{ title: 'Tippe auf „Teilen“', body: 'Das Quadrat mit dem Pfeil nach oben, in der Leiste von Safari. Siehst du es nicht, tippe zuerst auf die drei Punkte unten rechts.' },
			{ title: '„Zum Home-Bildschirm“ wählen', body: 'Schieb die Liste etwas nach oben, bis du „Zum Home-Bildschirm“ siehst, und tippe darauf.' },
			{ title: 'Auf „Hinzufügen“ tippen', body: 'Oben rechts. Den Namen kannst du so lassen.' }
		] as InstallSteps,
		iosMenu: [
			{ title: 'Tippe auf die drei Punkte', body: 'Unten rechts, neben der Adresse.' },
			{ title: 'Tippe auf „Teilen“', body: 'Ganz oben im Menü.' },
			{ title: '„Zum Home-Bildschirm“ wählen', body: 'Schieb die Liste nach oben. Steht es nicht da, tippe zuerst auf „Mehr“.' },
			{ title: 'Auf „Hinzufügen“ tippen', body: '„Als Web-App öffnen“ bleibt an. Dann oben rechts auf „Hinzufügen“.' }
		] as InstallSteps,
		android: [
			{ title: 'Öffne das Menü', body: 'Tippe oben rechts auf die drei Punkte.' },
			{ title: '„App installieren“ wählen', body: 'Je nach Version heißt es auch „Zum Startbildschirm hinzufügen“.' },
			{ title: 'Auf „Installieren“ tippen', body: 'Kurz warten: Das Symbol erscheint auf deinem Startbildschirm.' }
		] as InstallSteps,
		desktop: [
			{ title: 'Auf das Installieren-Symbol klicken', body: 'Rechts in der Adressleiste: ein Bildschirm mit einem Pfeil. Oder im Menü (drei Punkte) „Seite als App installieren“.' },
			{ title: 'Auf „Installieren“ klicken', body: 'Die App öffnet sich in einem eigenen Fenster und liegt danach im Startmenü oder im Dock.' }
		] as InstallSteps,
		mac: [
			{ title: 'Menü „Ablage“ öffnen', body: 'Oben in der Menüleiste von Safari.' },
			{ title: '„Zum Dock hinzufügen“ wählen', body: 'Dann auf „Hinzufügen“ klicken. Das geht ab macOS Sonoma.' }
		] as InstallSteps
	},
	done: {
		title: 'Geschafft!',
		body: (name: string) => `${name} ist jetzt auf deinem Startbildschirm. Du kannst die App jederzeit direkt öffnen und deine Noten auch offline nutzen.`
	},
	standalone: { title: 'Du nutzt schon die App', body: 'Du hast sie vom Startbildschirm aus geöffnet. Hier ist nichts mehr zu tun.' },
	manualDone: {
		title: 'Schau auf deinen Startbildschirm',
		body: (name: string) => `Dort sollte jetzt das Symbol von ${name} liegen. Öffne die App künftig darüber, dann geht alles mit einem Tipp, auch ohne Netz.`
	},
	open: 'Zur App'
} as const;
