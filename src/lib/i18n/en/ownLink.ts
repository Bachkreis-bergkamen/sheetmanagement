import type { Texts } from '../types.ts';

/** The member's own access link on /profil. */
export const ownLink: Texts['ownLink'] = {
	title: 'Personal access link',
	lead: 'A link to sign in without a password, e.g. on a second device.',
	create: 'Create access link',
	show: 'Show link',
	keep: "Personal: whoever has the link is signed in as you. Don't pass it on.",
	confirmRenew: 'Create a new link? The old one stops working, and anyone signed in with it is signed out.',
	confirmRenewViaLink: 'Create a new link? The old one stops working; devices signed in with it are signed out (not this one).',
	confirmRevoke: 'Revoke the link? Anyone signed in with it is signed out.',
	confirmRevokeViaLink: "Revoke the link? You're signed in with it, so you'll be signed out here too.",
	revoked: 'Link revoked.'
};
