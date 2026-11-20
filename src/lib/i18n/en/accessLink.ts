import type { Texts } from '../types.ts';

export const accessLink: Texts['accessLink'] = {
	title: 'Access by link',
	hello: (name: string) => (name ? `Hello ${name}!` : 'Hello!'),
	lead: 'With this personal link you sign in without a password.',
	signIn: 'Sign in',
	keep: "Keep the link safe and don't pass it on. It works until you (on your profile) or an admin create a new one.",
	invalid: 'This link no longer works. Please ask an admin for a new one.',
	toSignIn: 'To sign-in'
};
