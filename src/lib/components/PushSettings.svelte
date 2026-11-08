<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { t } from '#lib/i18n/index.ts';
	import Icon from './Icon.svelte';

	/**
	 * Notifications on this device (#157), on /profil. The browser makes the subscription with
	 * the app's public key; the server keeps it and sends reminders to it. Per device: the page
	 * only knows whether *this* one is on, and how many others the member has.
	 */
	let { publicKey, endpoints }: { publicKey: string; endpoints: string[] } = $props();

	type Status = 'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';
	let status = $state<Status>('loading');
	let mine = $state<string | null>(null);
	let busy = $state(false);
	let message = $state<{ text: string; error: boolean } | null>(null);
	const others = $derived(endpoints.filter((endpoint) => endpoint !== mine).length);

	const appleMobile = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

	async function registration(): Promise<ServiceWorkerRegistration | null> {
		if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
		// The worker may still be installing on a first visit; it doesn't take long.
		const ready = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
		return ready && 'pushManager' in ready ? ready : null;
	}

	function fromBase64url(text: string) {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	}

	const send = (method: 'POST' | 'DELETE', body: unknown) =>
		fetch('/api/push', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((response) => {
			if (!response.ok) throw new Error(`${response.status}`);
		});

	$effect(() => {
		(async () => {
			const found = await registration();
			if (!found) return void (status = appleMobile() ? 'install' : 'unsupported');
			const subscription = await found.pushManager.getSubscription();
			mine = subscription?.endpoint ?? null;
			// On here, but the server forgot it (e.g. a new database): sign it up again.
			if (subscription && Notification.permission === 'granted' && !endpoints.includes(subscription.endpoint)) {
				await send('POST', subscription.toJSON()).catch(() => undefined);
			}
			status = Notification.permission === 'denied' ? 'denied' : subscription && Notification.permission === 'granted' ? 'on' : 'off';
		})();
	});

	async function act(work: () => Promise<void>) {
		busy = true;
		message = null;
		try {
			await work();
			await invalidateAll();
		} catch (cause) {
			console.error(cause);
			message = { text: t.push.failed, error: true };
		} finally {
			busy = false;
		}
	}

	const enable = () =>
		act(async () => {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') return void (status = permission === 'denied' ? 'denied' : 'off');
			const found = (await registration())!;
			const options = { userVisibleOnly: true, applicationServerKey: fromBase64url(publicKey) };
			let subscription = await found.pushManager.subscribe(options).catch(async () => {
				// Subscribed with an older key: start over with the current one.
				await (await found.pushManager.getSubscription())?.unsubscribe();
				return found.pushManager.subscribe(options);
			});
			await send('POST', subscription.toJSON());
			mine = subscription.endpoint;
			status = 'on';
		});

	const disable = () =>
		act(async () => {
			const subscription = await (await registration())?.pushManager.getSubscription();
			if (subscription) {
				await send('DELETE', { endpoint: subscription.endpoint });
				await subscription.unsubscribe();
			}
			mine = null;
			status = 'off';
		});

	const test = () =>
		act(async () => {
			const response = await fetch('/api/push/test', { method: 'POST' });
			if (!response.ok) throw new Error(`${response.status}`);
			message = { text: t.push.testSent, error: false };
		});
</script>

<section class="ui-card push" id="benachrichtigungen">
	<h3><Icon name="bell" size={18} />{t.push.title}</h3>
	<p class="muted">{t.push.lead}</p>
	{#if status === 'unsupported'}
		<p class="msg info">{t.push.unsupported}</p>
	{:else if status === 'install'}
		<p class="msg info">{t.push.installFirst}</p>
	{:else if status === 'denied'}
		<p class="msg info">{t.push.denied}</p>
	{:else if status === 'on'}
		<p class="on"><Icon name="check" size={16} />{t.push.on}</p>
		<div class="ui-actions">
			<button class="btn secondary" disabled={busy} onclick={test}>{t.push.test}</button>
			<button disabled={busy} onclick={disable}>{t.push.disable}</button>
		</div>
	{:else if status === 'off'}
		<div><button class="btn" disabled={busy} onclick={enable}><Icon name="bell" size={16} />{t.push.enable}</button></div>
	{/if}
	{#if others && status !== 'loading'}<p class="muted small">{t.push.elsewhere(others)}</p>{/if}
	{#if message}<p class="msg" class:error={message.error} class:info={!message.error} role="status">{message.text}</p>{/if}
	{#if status === 'on' || status === 'off'}<p class="muted small">{t.push.hint}</p>{/if}
</section>

<style>
	.push {
		display: grid;
		gap: var(--space-3);
	}

	.push h3 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-lg);
	}

	.muted {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.small {
		font-size: var(--text-xs);
	}

	.on {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		color: var(--ok);
		font-weight: 600;
	}
</style>
