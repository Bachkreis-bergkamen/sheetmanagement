/**
 * Privacy notice and terms of use. They describe what this app actually does; if the
 * app changes (new cookies, new services, new data), change these texts too.
 * A template, not legal advice: each orchestra should check it for its own situation.
 */

export interface LegalSection {
	heading: string;
	paragraphs: string[];
	/** Bullet points after the paragraphs. */
	list?: string[];
}

export interface LegalContext {
	/** The orchestra or club, e.g. "Bachkreis Bergkamen". */
	name: string;
}

export const legal = {
	updated: 'Stand: Oktober 2026',
	contactHeading: 'Verantwortlich',
	contactMissing: (settings: string) => `Kontaktangaben fehlen noch (${settings}).`,
	email: 'E-Mail',
	links: {
		privacy: 'Datenschutz',
		terms: 'Nutzungsbedingungen'
	},

	privacy: {
		title: 'Datenschutzerklärung',
		lead: (c: LegalContext) =>
			`${c.name} betreibt diese Web-App für die eigenen Mitglieder: Noten, Konzerte und Programme an einem Ort. Hier steht, welche personenbezogenen Daten dabei verarbeitet werden.`,
		sections: (c: LegalContext): LegalSection[] => [
			{
				heading: 'Anmeldung mit Google',
				paragraphs: [
					'Zum Anmelden leitet die App zu Google weiter. Nach der Anmeldung erhält die App von Google deinen Namen und deine bestätigte E-Mail-Adresse. Die App erhält kein Passwort und keinen Zugriff auf Inhalte deines Google-Kontos.',
					`Damit prüft die App, ob du Mitglied des Orchesters bist und was du in der App tun darfst. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaft) und lit. f DSGVO (berechtigtes Interesse an einem geschützten Zugang).`
				]
			},
			{
				heading: 'Mitgliederliste',
				paragraphs: [
					`Für die Zugangsverwaltung gibt es eine Mitgliederliste in einer Google-Tabelle des Orchesters. Sie wird von Personen gepflegt, die Mitglieder freischalten dürfen (z. B. dem Vorstand).`
				],
				list: [
					'Mitglieder: E-Mail-Adresse, Name, Instrumente, Orchester, Status (aktiv, pausiert mit Datum, inaktiv), Gruppen und Rollen (z. B. „Vorstand“) und vergebene Rechte. Name, Instrumente, Orchester und Status kannst du im Profil selbst ändern.',
					'Zugang per Link: Für Mitglieder ohne Google-Konto kann die Verwaltung einen persönlichen Anmeldelink erzeugen. In der Tabelle steht dazu nur eine Versionsnummer; ein neuer Link macht den alten ungültig.',
					'Zugangsanfragen: E-Mail-Adresse, Name und Datum der Anfrage. Sie werden gelöscht, sobald über die Anfrage entschieden ist.',
					'Mitgliedsdaten werden gelöscht, wenn du austrittst oder es verlangst.'
				]
			},
			{
				heading: 'Meldungen und Wünsche',
				paragraphs: [
					`Wenn du ein Problem mit Noten meldest oder einen Wunsch einträgst, speichert die App deinen Text zusammen mit deinem Namen, deiner E-Mail-Adresse und dem Datum in der Google-Tabelle des Orchesters. Gibst du einem Wunsch ein „+1“, wird deine E-Mail-Adresse beim Wunsch gespeichert, damit jede Person nur einmal zählt.`,
					`Alle Mitglieder sehen Meldungen und Wünsche, aber nicht, von wem sie stammen und wer „+1“ gegeben hat. Das sehen nur die Personen, die Meldungen bearbeiten oder Mitglieder verwalten dürfen, damit sie nachfragen können. Meldungen zu einer Datei können zusätzlich als Kommentar an der Datei in Google Drive erscheinen, ohne deinen Namen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse, die Noten und die App gemeinsam zu verbessern). Auf Wunsch werden deine Einträge gelöscht.`
				]
			},
			{
				heading: 'Zu- und Absagen',
				paragraphs: [
					'Wenn du für eine Probe oder ein Konzert zu- oder absagst, speichert die App deine Antwort mit Name, E-Mail-Adresse, Datum, dem Instrument für diesen Termin und deinem Kommentar in der Google-Tabelle des Orchesters. Alle Mitglieder sehen nur, wie viele je Stimme zugesagt haben; wer was geantwortet hat und die Kommentare sehen nur Personen mit dem Recht dazu (z. B. Dirigat und Organisation). Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Probenbetrieb des Vereins). Du kannst deine Antwort jederzeit zurückziehen.'
				]
			},
			{
				heading: 'Kalender-Link',
				paragraphs: [
					'Im Profil kannst du einen persönlichen Kalender-Link erzeugen, den deine Kalender-App abonniert. Er enthält die Termine deiner Orchester, deine eigene Zu- oder Absage und was geprobt wird. In der Tabelle steht dazu nur eine Versionsnummer. Wer den Link hat, sieht diese Angaben; mit „Neuen Link erzeugen“ oder „Link sperren“ wird der alte sofort ungültig.'
				]
			},
			{
				heading: 'Benachrichtigungen',
				paragraphs: [
					'Im Profil kannst du Benachrichtigungen für ein Gerät erlauben. Die App erinnert dich dann an Proben und Konzerte der nächsten Tage, auf die du noch nicht geantwortet hast; wer Leihmaterial betreut, an Rückgabetermine, und wer die App verwaltet, an Störungen der Verbindung zu Google. Nachts wird nichts verschickt.',
					'Dafür speichert die App die Adresse, die dein Browser für die Benachrichtigungen vergibt, zwei Schlüssel zum Verschlüsseln und deine E-Mail-Adresse; dazu, welche Erinnerung an wen ging, damit niemand eine doppelt bekommt. Das liegt in einer Datenbank bei Cloudflare (D1), nicht in der Google-Tabelle. Zugestellt werden die Nachrichten verschlüsselt über den Dienst deines Browsers (bei Chrome und Android Google, bei Safari und iPhone Apple, bei Firefox Mozilla); er sieht nicht, was darin steht.',
					'Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Mit „Ausschalten“ oder beim Abmelden wird das Gerät sofort gelöscht; Einträge über verschickte Erinnerungen nach einem Jahr.'
				]
			},
			{
				heading: 'E-Mail',
				paragraphs: [
					'Wenn das Orchester ein E-Mail-Konto verbunden hat, kannst du dir auf der Anmeldeseite einen Anmeldelink schicken lassen; er gilt 15 Minuten und geht nur an Adressen, die in der Mitgliederliste stehen. Wer auf keinem Gerät Benachrichtigungen erlaubt hat, bekommt dieselben Erinnerungen per E-Mail, mit Links, über die du direkt zu- oder absagen kannst.',
					'Verschickt werden die E-Mails über Gmail vom Google-Konto des Orchesters (Google Ireland Ltd.); Google verarbeitet dabei deine E-Mail-Adresse und den Inhalt der Nachricht. Die App speichert dafür keine weiteren Daten: Links sind signiert und werden nirgends abgelegt. Damit die Anmeldeseite nicht missbraucht wird, zählt die App für eine Stunde, wie oft ein Link für eine Adresse und von einer IP-Adresse angefordert wurde (in der Datenbank bei Cloudflare).',
					'Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Probenbetrieb des Vereins). Erinnerungen per E-Mail kannst du im Profil jederzeit abbestellen; das speichert die App, bis du sie wieder einschaltest.'
				]
			},
			{
				heading: 'Probenzeit',
				paragraphs: [
					'Im Profil kannst du „Probenzeit aufzeichnen“ einschalten. Dann zählt die App, wie lange eine Stimme deines Instruments aus „Meine Noten“ in der App geöffnet und sichtbar ist, und speichert je Tag deine E-Mail-Adresse, das Datum und die Sekunden in der Datenbank bei Cloudflare (D1), nicht in der Google-Tabelle. Welche Stimme du geöffnet hattest, gehört nicht zur Zeit.',
					'Was du beim Üben in eine Stimme zeichnest, speichert die App mit deiner E-Mail-Adresse, der Stimme und der Seite in derselben Datenbank, damit du es beim nächsten Öffnen wiederfindest.',
					'Beides siehst nur du selbst, nicht die Verwaltung, nicht die anderen Mitglieder und in keiner Auswertung. Nur wenn du deine Notizen in einer Stimme mit deiner Stimmgruppe teilst, sehen die, die diese Stimme spielen, eine Kopie davon und können sie übernehmen; mit „Nicht mehr teilen“ endet das Angebot, Übernommenes bleibt bei ihnen. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Mit „Aufzeichnen ausschalten“ zählt nichts mehr; „Aufgezeichnete Zeit löschen“ und „Alle Notizen löschen“ im Profil löschen sofort alles.'
				]
			},
			{
				heading: 'Anwesenheit bei Proben',
				paragraphs: [
					'Nach einer Probe können Personen mit dem Recht „Anwesenheit erfassen“ (z. B. Dirigat und Organisation) eintragen, wer da war. Gespeichert werden nur Termin, Name, E-Mail-Adresse und ob du anwesend warst, im Blatt „Anwesenheit“ der Google-Tabelle des Orchesters. Daraus zeigt die App, bei wie vielen Proben vor einem Konzert du dabei warst.',
					'Das sehen nur du selbst und die Personen mit diesem Recht, nicht die anderen Mitglieder. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Probenbetrieb des Vereins). Die Einträge werden gelöscht, wenn du austrittst oder es verlangst.'
				]
			},
			{
				heading: 'Konzert- und Probenfahrten',
				paragraphs: [
					'Falls das Orchester Fahrten in der App plant: Wenn du dich zu einer Fahrt anmeldest, speichert die App deinen Namen, deine E-Mail-Adresse, als was du mitfährst, ob du später ankommst oder früher abfährst, deinen Hinweis an die Organisation und wann du dich angemeldet hast, in einer Datenbank bei Cloudflare (D1), nicht in der Google-Tabelle. Bei jungen Mitgliedern speichert sie auch, welcher Elternteil die Anmeldung bestätigt hat.',
					'Wer mitfährt (Name und Rolle), sehen alle, die zur Fahrt angemeldet sind, und die Eltern angemeldeter Kinder. Deinen Hinweis, die Warteliste und Absagen sieht nur die Organisation der Fahrt. Bitte schreib in den Hinweis keine Gesundheitsangaben; dafür gibt es eine eigene Liste mit ausdrücklicher Einwilligung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Fahrten des Vereins). Die Anmeldungen werden mit der Fahrt gelöscht, bei „Mitglied löschen“ sofort, und stehen in „Meine Daten herunterladen“.',
					'Zu einer Fahrt kann die Organisation Listen anlegen: deine Instrumente, die mitkommen (mit Besitzer, Wert, Versicherung und auf Wunsch Seriennummer, für die Versicherung und den Zoll), Ernährung, Allergien und Medikamente, Zimmer- und Buswünsche, einen Notfallkontakt, ob ein gültiger Ausweis da ist (nur ja oder nein, keine Nummern), Einverständnisse (Fotos, allein reisen, bei jungen Mitgliedern Freizeit ohne Betreuung) und eigene Fragen der Fahrt. Jede Liste sagt beim Ausfüllen, wer sie sieht: die Instrumente, Wünsche, Ausweis und Fragen nur die Organisation, Ernährung, Notfallkontakt und Einverständnisse auch die Betreuer·innen auf der Fahrt. Für die Küche gibt es Zahlen ohne Namen; Namen nur bei schweren Allergien und besonderen Hinweisen. Die Einverständnisse junger Mitglieder geben die Eltern.',
					'Allergien und Medikamente sind Gesundheitsdaten (Art. 9 DSGVO). Die App speichert sie nur mit deiner ausdrücklichen Einwilligung, die du bei jeder Fahrt neu gibst und jederzeit widerrufen kannst (Art. 9 Abs. 2 lit. a DSGVO). Für die übrigen Listen ist die Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO. Alle Listen einer Fahrt werden vier Wochen nach ihrem Ende gelöscht; die Fahrt, ihr Plan und die Anmeldungen bleiben. Nur was du mit „Für die nächste Fahrt merken“ ankreuzt, bleibt für dich gespeichert, bis du den Haken entfernst, Gesundheitsangaben nie ohne diesen Haken. Deine Instrumente bleiben gespeichert, bis du sie entfernst. Alles steht in „Meine Daten herunterladen“ und wird bei „Mitglied löschen“ gelöscht.',
					'Zu jeder Fahrt kann die App ein Foto des Ortes zeigen, von Wikimedia Commons. Die App holt es selbst und liefert es aus; dein Browser fragt Wikimedia dabei nicht, deine Adresse erfährt Wikimedia also nicht.'
				]
			},
			{
				heading: 'Hinweise und Probennotizen',
				paragraphs: [
					'Wer Programme plant, kann zu Stücken Hinweise aus den Proben (z. B. Sprünge oder Striche) und nach einer Probe eine Notiz eintragen, was geprobt wurde. Gespeichert werden der Text, der Name der Person, die ihn geschrieben hat, und das Datum, in den Blättern „Hinweise“ und „Probennotizen“ der Google-Tabelle des Orchesters. Alle Mitglieder sehen sie. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Probenbetrieb des Vereins).'
				]
			},
			{
				heading: 'Angaben zu Stücken nachschlagen',
				paragraphs: [
					'Wer Angaben zu Stücken pflegt, kann auf Knopfdruck bei Wikidata (Wikimedia Foundation, USA) nach dem Werk suchen. Dabei schickt dein Browser den Titel des Stücks und den eingetragenen Komponisten an Wikidata; wie bei jedem Seitenaufruf erfährt Wikimedia dabei deine IP-Adresse. Daten über dich oder andere Mitglieder werden nicht übertragen. Es gilt die Datenschutzerklärung der Wikimedia Foundation (foundation.wikimedia.org/wiki/Policy:Privacy_policy).',
					'„Aus den Noten lesen“ liest den Text der ersten Seiten einer PDF nur in deinem Browser und übernimmt daraus ausschließlich Komponist, Arrangeur und Werkverzeichnis. „Hörbeispiel auf YouTube suchen“ öffnet die YouTube-Suche in einem neuen Fenster; dort gilt die Datenschutzerklärung von Google. „Dauer aus dem Video“ fragt vom Server der App aus bei YouTube nach der Länge des verlinkten Videos; übermittelt wird nur die Video-ID.',
					'Auf der Seite eines Stücks zeigt die App ein Porträt des Komponisten von Wikimedia Commons, wenn es eines gibt. Das Bild lädt der Server der App bei Wikidata und Wikimedia Commons; dein Gerät nimmt dabei keinen Kontakt zu Wikimedia auf, und übermittelt wird nur der Name des Komponisten.'
				]
			},
			{
				heading: 'Cookies und Speicher im Browser',
				paragraphs: [
					'Die App nutzt nur technisch notwendige Cookies, keine Analyse-, Tracking- oder Werbe-Cookies. Dafür ist keine Einwilligung nötig (§ 25 Abs. 2 Nr. 2 TDDDG).'
				],
				list: [
					'„session“: hält dich angemeldet. Enthält deinen Namen und deine E-Mail-Adresse, ist gegen Veränderung gesichert und läuft nach 30 Tagen ab, beim Abmelden sofort.',
					'„oauth_state“: schützt die Anmeldung vor Missbrauch und wird nach höchstens 10 Minuten gelöscht.',
					'„instrument“: merkt sich auf „Meine Noten“, welches Instrument du spielst, wenn du nicht angemeldet bist. Läuft nach einem Jahr ab.',
					'„konzerte-ansicht“: merkt sich, ob du den Kalender als Liste oder als Monat sehen willst. Läuft nach einem Jahr ab.',
					'Im Speicher deines Browsers (localStorage) merkt sich die App, ob du das helle oder dunkle Farbschema gewählt hast, und welche Stücke und Konzerte du zuletzt über die Schnellsuche geöffnet hast. Diese Angaben verlassen deinen Browser nicht.'
				]
			},
			{
				heading: 'Seitenaufrufe',
				paragraphs: [
					'Damit die App einfacher werden kann, zählt sie, wie oft jede Art von Seite geöffnet wird, zum Beispiel „Stück“ oder „Kalender“, je Tag und getrennt nach Mitgliedern und Verwaltung. Gespeichert wird nur diese Zahl, nicht wer die Seite geöffnet hat, nicht welches Stück oder welcher Termin, keine IP-Adresse und kein Cookie. Die Zahlen sehen nur Admins, und sie werden nach 180 Tagen gelöscht. Weil sich daraus niemand bestimmen lässt, sind es keine personenbezogenen Daten.'
				]
			},
			{
				heading: 'Hosting bei Cloudflare',
				paragraphs: [
					'Die App läuft bei Cloudflare (Cloudflare, Inc., USA, mit Rechenzentren weltweit). Bei jedem Aufruf werden technisch deine IP-Adresse, der Zeitpunkt und die aufgerufene Adresse verarbeitet, um die Seite auszuliefern und vor Angriffen zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert.',
					'Terminumfragen (falls das Orchester sie nutzt): Umfragen und Antworten – dein Name, deine E-Mail-Adresse, deine Antworten und dein Kommentar – speichert die App in einer Datenbank bei Cloudflare (D1). Sie sind nur für die Gruppen sichtbar, an die sich die Umfrage richtet, und verschwinden, wenn die Umfrage gelöscht wird.'
				]
			},
			{
				heading: 'Noten, Termine und Tabelle bei Google',
				paragraphs: [
					`Noten, Probentermine und die Repertoire-Tabelle liegen in Google Drive, Google Kalender und Google Tabellen des Orchesters. Die App liest sie über ein eigenes technisches Konto. Wenn du Noten öffnest, öffnen sie sich direkt bei Google, angemeldet mit deinem eigenen Google-Konto. Dafür gilt die Datenschutzerklärung von Google (policies.google.com/privacy). Google ist nach dem EU-US Data Privacy Framework zertifiziert.`
				]
			},
			{
				heading: 'Wo deine Daten liegen und wie lange',
				paragraphs: ['Ein Überblick über die Abschnitte oben:'],
				list: [
					'Google-Tabelle des Orchesters: Mitgliederliste, Rechte, Zugangsanfragen, Zu- und Absagen, Anwesenheit, Meldungen, Wünsche, Hinweise und Probennotizen. Bis du austrittst oder die Löschung verlangst; Zugangsanfragen nur, bis über sie entschieden ist. Stellt das Orchester eine Aufbewahrungsfrist ein, verlieren Zu- und Absagen und Anwesenheit nach so vielen Saisons deinen Namen.',
					'Datenbank bei Cloudflare (D1): Geräte für Benachrichtigungen (bis du sie ausschaltest), verschickte Erinnerungen (ein Jahr), ob du E-Mails abbestellt und die Tour beendet hast, Probenzeit und Eintragungen in Noten (bis du sie löschst), Terminumfragen (bis die Umfrage gelöscht wird) und Zähler gegen Missbrauch der Anmeldung (ein Tag).',
					'Google Drive und Google Kalender: die Noten und die Termine. Daten über dich stehen dort nicht; Kommentare zu gemeldeten Dateien erscheinen ohne deinen Namen. Ist die Datenbank die Quelle, legt die App außerdem jede Woche eine Sicherung aller gepflegten Daten in einem Drive-Ordner ab, den nur die Verwaltung öffnen kann; die letzten acht bleiben, ältere kommen in den Papierkorb.',
					'Zwischenspeicher bei Cloudflare (KV): kurzlebige Kopien von Archiv, Kalender und Tabelle, damit Seiten schnell laden. Sie werden laufend durch neue ersetzt.',
					'Dein Browser: die Cookies und Einstellungen aus dem Abschnitt „Cookies und Speicher im Browser“.',
					'Nach einer Löschung bleiben Einträge, die auch für andere zählen (Zu- und Absagen, Anwesenheit, „+1“, Antworten in Terminumfragen), ohne Namen und E-Mail-Adresse stehen, damit Zählungen und Saisonberichte stimmen. Niemand kann sie dir dann noch zuordnen.'
				]
			},
			{
				heading: 'Deine Rechte',
				paragraphs: [
					'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit sowie das Recht, der Verarbeitung zu widersprechen (Art. 15 bis 21 DSGVO). Wende dich dafür an die oben genannte Kontaktadresse.',
					'Was die App in der Google-Tabelle über dich speichert, kannst du jederzeit selbst im Profil unter „Meine Daten herunterladen“ als Datei laden. Bittest du um Löschung, löscht die Verwaltung mit „Alle Daten löschen“ alles in einem Schritt, nachdem sie gesehen hat, was dabei wegfällt.',
					'Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der deines Bundeslandes.'
				]
			}
		]
	},

	terms: {
		title: 'Nutzungsbedingungen',
		lead: (c: LegalContext) => `${c.name} stellt diese Web-App den eigenen Mitgliedern kostenlos zur Verfügung.`,
		sections: (c: LegalContext): LegalSection[] => [
			{
				heading: 'Wer die App nutzen darf',
				paragraphs: [
					`Die App ist nur für Mitglieder des Orchesters. Den Zugang schalten die dafür zuständigen Personen frei. Melde dich nur mit deinem eigenen Google-Konto an und gib deinen Zugang nicht weiter.`
				]
			},
			{
				heading: 'Noten und Urheberrecht',
				paragraphs: [
					`Viele Noten sind urheberrechtlich geschützt oder nur für das Orchester lizenziert. Nutze sie nur für Proben und Auftritte des Orchesters und für das Üben dafür.`
				],
				list: [
					'Gib Noten nicht an Personen außerhalb des Orchesters weiter.',
					'Veröffentliche oder teile sie nicht im Internet, auch nicht in Messengern oder sozialen Netzwerken.'
				]
			},
			{
				heading: 'Inhalte',
				paragraphs: [
					'Programme, Termine und Angaben zu Stücken werden von Mitgliedern gepflegt und können Fehler enthalten. Verbindlich sind die Absprachen der musikalischen Leitung und des Vorstands.'
				]
			},
			{
				heading: 'Verfügbarkeit und Änderungen',
				paragraphs: [
					'Es besteht kein Anspruch darauf, dass die App jederzeit erreichbar ist. Sie kann geändert oder eingestellt werden. Der Zugang endet mit dem Austritt aus dem Orchester und kann bei Verstößen gegen diese Bedingungen entzogen werden.'
				]
			}
		]
	}
};
