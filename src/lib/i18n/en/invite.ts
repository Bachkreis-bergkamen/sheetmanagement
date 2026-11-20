import type { Texts } from '../types.ts';

export const invite: Texts['invite'] = {
	title: 'Welcome!',
	lead: "You've been invited. Sign up here and you can get started right away.",
	aboutYou: 'About you',
	signIn: 'How you sign in',
	signInLead: 'From now on you sign in with this email address and password.',
	join: 'Sign up and get started',
	nameMissing: 'Please enter your first and last name.',
	instrumentMissing: 'Please choose at least one instrument.',
	exists: "You're already signed up with this email address. Just sign in.",
	joinFailed: "Signing up didn't work just now. Please try again.",
	invalid: 'This invitation has expired or was already used. Please ask the admins for a new one.',
	failed: "The invitation couldn't be saved just now. Please try again.",
	adminTitle: 'Invite with a link',
	adminLead: (days: number) =>
		`You send a link, and the person enters their name, email address, password and instrument themselves. Each link works once and for ${days} days.`,
	label: 'For whom? (optional)',
	labelHint: 'Only for you, to recognise the link in the list.',
	roles: 'Roles (optional)',
	create: 'Create invitation link',
	created: 'Link created. Copy it and send it by messenger or email.',
	open: 'Open invitations',
	unnamed: 'No name',
	until: (day: string) => `valid until ${day}`,
	revoke: 'Withdraw',
	confirmRevoke: "Withdraw the invitation? The link won't work any more.",
	revoked: 'Invitation withdrawn.',
	unavailable: 'Invitations need the database (D1), because new members sign in with a password.'
};
