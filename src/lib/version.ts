/**
 * Which version of the app is running (#206): the version in package.json and the commit it
 * was built from, both set by Vite at build time. The commit links to its page on GitHub, so
 * an admin sees exactly what is deployed.
 */

/** Where the app's source lives. */
export const REPOSITORY = 'https://github.com/Bachkreis-bergkamen/sheetmanagement';

export const APP_VERSION = __APP_VERSION__;
/** The full commit hash; empty when the build had no git (e.g. from a zip). */
export const APP_COMMIT = __APP_COMMIT__;

/** "a1b2c3d4…" → "a1b2c3d" */
export const shortCommit = (commit: string) => commit.slice(0, 7);

/** "v0.15.0 (a1b2c3d)", or "v0.15.0" without a commit. */
export function versionLabel(version = APP_VERSION, commit = APP_COMMIT): string {
	return commit ? `v${version} (${shortCommit(commit)})` : `v${version}`;
}

/** The commit's page on GitHub, else the repository. */
export function versionUrl(commit = APP_COMMIT): string {
	return /^[0-9a-f]{7,40}$/i.test(commit) ? `${REPOSITORY}/commit/${commit}` : REPOSITORY;
}
