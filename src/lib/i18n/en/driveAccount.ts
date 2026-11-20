import type { Texts } from '../types.ts';

export const driveAccount: Texts['driveAccount'] = {
	connect: 'Connect Drive account for uploads',
	disconnect: 'Disconnect Drive account',
	confirmDisconnect: 'Disconnect the Drive account? New parts can no longer be uploaded.',
	connected: (email: string) => `New parts are uploaded as ${email}.`,
	lead: 'New parts are uploaded as the account that owns the music archive, because the app’s service account has no storage of its own. Google asks for access to Drive.',
	connectedNow: 'Drive account connected.',
	noScope: 'Google did not grant access to Drive. Please connect again and tick Drive.',
	wrongUser: 'Only people who may manage members can connect the Drive account.',
	connectFailed: 'Connecting did not work. Please try again.',
	disconnectedNow: 'Drive account disconnected.'
};
