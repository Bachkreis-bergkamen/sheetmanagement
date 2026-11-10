/** What a new password needs; shared by the forms and the server. Length is what counts, no rules about digits or symbols. */
export const MIN_LENGTH = 10;
/** Long passphrases are fine; this only stops someone from sending megabytes to hash. */
export const MAX_LENGTH = 200;

export type PasswordProblem = 'short' | 'long' | 'mismatch';

/** What's wrong with a new password, if anything. */
export function passwordProblem(password: string, repeated: string): PasswordProblem | null {
	if ([...password].length < MIN_LENGTH) return 'short';
	if (password.length > MAX_LENGTH) return 'long';
	if (password !== repeated) return 'mismatch';
	return null;
}
