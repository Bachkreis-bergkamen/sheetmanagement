import type { Texts } from '../types.ts';

/** Email and password sign-in: the form on /anmelden, signing up and resetting by email, the profile. */
export const password: Texts['password'] = {
	email: 'Email address',
	password: 'Password',
	signIn: 'Sign in',
	signInErrors: {
		wrong: "The email address or password isn't right.",
		limited: 'Too many attempts. Please try again in a quarter of an hour.',
		failed: "That didn't work just now. Please try again."
	} as Record<string, string>,
	createOrReset: 'Create an account or forgot your password?',
	noMailHint: 'No password yet? Ask an admin for a personal link, then set a password on your profile.',
	requestTitle: 'Set a password',
	requestLead: "For a new account or if you forgot your password: we'll send you a link to set a password.",
	send: 'Send link by email',
	sent: (email: string) => `We sent a link to ${email}. It works for an hour. Check your spam folder too.`,
	mailErrors: {
		invalid: 'Please enter an email address.',
		limited: 'Too many attempts. Please try again in an hour.',
		failed: "That didn't work just now. Please try again."
	} as Record<string, string>,
	noMail: 'No emails can be sent right now. Please ask an admin for a personal link; then you can set a password on your profile.',
	toSignIn: 'To sign-in',
	newSubject: (orchestra: string) => `Your account: ${orchestra}`,
	newBody: (name: string, orchestra: string, link: string) =>
		`Hello${name ? ` ${name}` : ''},\n\nwith this link you set your password for ${orchestra}. It works for an hour:\n\n${link}\n\nYou didn't want an account? Then just delete this email.`,
	resetSubject: (orchestra: string) => `New password: ${orchestra}`,
	resetBody: (name: string, link: string) =>
		`Hello${name ? ` ${name}` : ''},\n\nwith this link you set a new password. It works for an hour, and only once:\n\n${link}\n\nYou didn't ask for a new password? Then just delete this email; your password stays as it is.`,
	setTitle: 'Set a password',
	resetTitle: 'New password',
	setLead: (email: string) => `For ${email}.`,
	newPassword: 'New password',
	repeat: 'Once more',
	current: 'Current password',
	rule: (min: number) => `At least ${min} characters. A sentence you can remember beats a short complicated word.`,
	problems: {
		short: 'The password is too short.',
		long: 'The password is too long.',
		mismatch: "The two passwords don't match."
	} as Record<string, string>,
	save: 'Save password',
	failed: "The password couldn't be saved just now. Please try again.",
	linkInvalid: 'This link has expired or was already used.',
	newLink: 'Ask for a new link',
	profileTitle: 'Password',
	profileHas: (email: string) => `You can sign in with ${email} and your password. A new password signs you out everywhere else.`,
	profileNone: (email: string) => `Set a password to also sign in with ${email} and a password.`,
	set: 'Set password',
	change: 'Change password',
	saved: 'Password saved.',
	wrongCurrent: "The current password isn't right.",
	forgot: 'Forgot your password?'
};
