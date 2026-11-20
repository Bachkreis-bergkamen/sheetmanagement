export const driveAccount = {
	connect: 'Drive-Konto für Uploads verbinden',
	disconnect: 'Drive-Konto trennen',
	confirmDisconnect: 'Drive-Konto trennen? Neue Stimmen lassen sich dann nicht mehr hochladen.',
	connected: (email: string) => `Neue Stimmen werden als ${email} hochgeladen.`,
	lead: 'Neue Stimmen werden als das Konto hochgeladen, dem das Notenarchiv gehört, denn das Dienstkonto der App hat keinen eigenen Speicher. Google fragt dabei nach Zugriff auf Drive.',
	connectedNow: 'Drive-Konto verbunden.',
	noScope: 'Google hat den Zugriff auf Drive nicht erteilt. Bitte noch einmal verbinden und den Haken bei Drive setzen.',
	wrongUser: 'Nur wer Mitglieder verwalten darf, kann das Drive-Konto verbinden.',
	connectFailed: 'Das Verbinden hat nicht geklappt. Bitte noch einmal versuchen.',
	disconnectedNow: 'Drive-Konto getrennt.'
} as const;
