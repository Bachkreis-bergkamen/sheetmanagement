import type { Texts } from '../types.ts';

export const auth: Texts['auth'] = {
	title: 'Sign in',
	lead: 'Sign in to see music, concerts and programmes.',
	button: 'Sign in with Google',
	privacy: 'The app only learns your name and email address.',
	notReady: "Sign-in isn't fully set up yet:",
	errors: {
		abgebrochen: 'Sign-in was cancelled.',
		abgelaufen: 'Sign-in has expired. Please try again.',
		konto: 'This Google account has no verified email address.',
		oidc: "Signing in with the provider didn't work just now. Please try again.",
		'oidc-konto': 'This account has no verified email address. Please sign in another way.',
		google: "Google didn't confirm the sign-in just now. Please try again."
	} as Record<string, string>,
	oidc: {
		button: (label: string) => `Sign in with ${label}`,
		defaultLabel: 'your school account',
		issuerNotHttps: 'OIDC_ISSUER must be an https address.'
	},
	signedInAs: (email: string) => `Signed in as ${email}`,
	logout: 'Sign out',
	switchAccount: 'Sign in with another account',
	/** Several accounts on one device (an admin's and a member's, a shared tablet). */
	accounts: {
		title: 'Accounts on this device',
		lead: 'Switch between accounts without signing in again, e.g. on a shared device.',
		add: 'Add another account',
		switchTo: 'Switch',
		forget: 'Remove',
		forgetConfirm: (name: string) => `Remove ${name} from this device?`,
		current: 'Active',
		onDevice: 'Saved on this device'
	}
};
