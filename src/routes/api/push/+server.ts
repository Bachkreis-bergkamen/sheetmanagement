import { error, json } from '@sveltejs/kit';
import { normalizeEmail } from '#lib/access/access.ts';
import * as t from '#lib/i18n/texts.ts';
import { getStore } from '#lib/server/db/index.ts';
import { pushReady } from '#lib/server/push/index.ts';
import type { RequestHandler } from './$types';

/**
 * This device's notifications (#157), from /profil: POST signs it up with the subscription
 * the browser made, DELETE takes it off again (also on sign-out, from the service worker).
 * Only for signed-in members, and only for their own devices.
 */

function member(locals: App.Locals): string {
	if (!pushReady()) error(404, t.error.notFound);
	const user = locals.access.user;
	if (!user || !locals.access.member) error(403, t.messages.signInFirst);
	return normalizeEmail(user.email);
}

/** An https address and the two keys, as PushSubscription.toJSON() gives them. */
function readSubscription(body: unknown) {
	const value = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
	const endpoint = typeof value?.endpoint === 'string' ? value.endpoint : '';
	const { p256dh, auth } = value?.keys ?? {};
	if (!endpoint.startsWith('https://') || endpoint.length > 1000 || typeof p256dh !== 'string' || typeof auth !== 'string') error(400);
	if (!/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,32}$/.test(auth)) error(400);
	return { endpoint, p256dh, auth };
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const email = member(locals);
	const subscription = readSubscription(await request.json().catch(() => null));
	await getStore().savePush({ ...subscription, email });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	const email = member(locals);
	const { endpoint } = ((await request.json().catch(() => null)) ?? {}) as { endpoint?: unknown };
	const store = getStore();
	if (typeof endpoint === 'string' && (await store.pushOf(email)).some((device) => device.endpoint === endpoint)) await store.deletePush(endpoint);
	return json({ ok: true });
};
