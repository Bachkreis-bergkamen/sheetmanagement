/** The tour for new members: the essentials, then setting the app up on their profile; retaken from /profil. */
export const tour = {
	label: 'Tour durch die App',
	welcome: (name: string) => (name ? `Willkommen, ${name}!` : 'Willkommen!'),
	offer: 'In zwei Minuten siehst du, wo deine Termine und Noten sind, und richtest die App für dich ein.',
	offerOpen: 'In einer Minute siehst du, wo die Termine und Noten sind.',
	chapters: {
		basics: 'Das Wichtigste',
		basicsHint: (n: number) => `${n} kurze Schritte`,
		setup: 'Für dich einrichten',
		setupHint: 'Instrument, Ansicht, Erinnerungen'
	},
	start: 'Tour starten',
	skip: 'Überspringen',
	end: 'Tour beenden',
	back: 'Zurück',
	next: 'Weiter',
	finish: 'Fertig',
	step: (n: number, of: number) => `Schritt ${n} von ${of}`,
	setupOffer: {
		title: 'Das Wichtigste kennst du',
		body: 'Magst du die App noch kurz für dich einrichten? Das dauert eine Minute.',
		start: 'Einrichten',
		later: 'Später'
	},
	steps: {
		home: { title: 'Dein nächster Termin', body: 'Hier steht immer, was als Nächstes ansteht. Mit einem Tipp sagst du zu oder ab und öffnest deine Noten dafür.' },
		parts: { title: 'Meine Noten', body: 'Deine Stimmen für die nächsten Proben und Konzerte, passend zu deinem Instrument. Offline gespeichert gehen sie auch im Probenraum ohne Netz.' },
		calendar: { title: 'Kalender', body: 'Alle Proben und Konzerte mit Zeit, Ort und Programm. Hier antwortest du auch auf spätere Termine.' },
		pieces: { title: 'Archiv', body: 'Jedes Stück mit Noten, Hörbeispielen und Hinweisen, unter „Mehr“. Das Feld hier filtert die Liste, auch nach Stimme; die Lupe oben findet alles in der App.' },
		more: { title: 'Mehr', body: 'Alle weiteren Seiten, zum Beispiel das Archiv und die Chronik. Ganz unten stellst du hell oder dunkel und die Schriftgröße ein.' },
		instruments: { title: 'Dein Instrument', body: 'Trag ein, was du spielst; danach richtet sich „Meine Noten“. Mit „Speichern“ gilt es überall.' },
		view: { title: 'Ansicht und Schrift', body: 'Hell, dunkel oder wie dein Gerät, und die Schrift größer, wenn du magst. Probier es gleich aus.' },
		notifications: { title: 'Erinnerungen', body: 'Lass dich an Antworten, Proben und Leihmaterial erinnern: auf diesem Gerät oder per E-Mail.' },
		install: { title: 'Aufs Handy', body: 'Als App auf dem Startbildschirm öffnet sich alles mit einem Tipp, auch ohne Netz. Die Anleitung zeigt dir, wie.' },
		done: { title: 'Fertig!', body: 'Viel Spaß beim Spielen. Die Tour findest du hier jederzeit wieder.' },
		doneOpen: { title: 'Fertig!', body: 'Viel Spaß beim Spielen. Hell, dunkel und die Schriftgröße findest du unter „Mehr“.' }
	},
	retake: 'Tour noch einmal machen',
	retakeHint: 'Das Wichtigste und deine Einstellungen, Schritt für Schritt.'
} as const;
