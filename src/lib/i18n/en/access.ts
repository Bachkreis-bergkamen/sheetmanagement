import type { Texts } from '../types.ts';

export const access: Texts['access'] = {
	title: 'Request access',
	hello: (name: string) => `Hello ${name}!`,
	lead: "You're signed in but not approved as a member yet.",
	request: 'Request access',
	nameLabel: 'First and last name',
	surnameNeeded: 'Please give your first and last name so the admins know who you are.',
	requested: 'Your request has arrived. Once it is approved you can use the app. Reload the page then.',
	unavailable: "Requests aren't possible right now. Please contact the committee directly."
};
