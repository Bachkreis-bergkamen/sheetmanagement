<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import Crumbs from '#lib/components/Crumbs.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Title from '#lib/components/Title.svelte';
	import { loadList, loadPending, saveList, savePending, type PendingCheckIn } from '#lib/tickets/door-store.ts';
	import { admit, searchDoor, type Admission, type DoorTicket } from '#lib/tickets/tickets.ts';
	import { codeReader } from '#lib/tickets/scanner.ts';

	let { data } = $props();
	const d = t.tickets.doorPage;
	const id = $derived(data.concert.id);
	const api = $derived(`/api/einlass/${encodeURIComponent(data.concert.id)}`);

	let tickets = $state<DoorTicket[]>([]);
	let loadedAt = $state('');
	let pending = $state<PendingCheckIn[]>([]);
	let failed = $state(false);
	let syncing = $state(false);
	let result = $state<Admission | null>(null);
	let code = $state('');
	let query = $state('');
	let scanning = $state(false);
	let noCamera = $state(false);
	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | undefined;

	const byCode = $derived(new Map(tickets.map((ticket) => [ticket.code, ticket])));
	const inside = $derived(tickets.filter((ticket) => ticket.checkedInAt).length);
	const found = $derived(searchDoor(tickets, query).slice(0, 30));
	const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	/** The server's list, with this phone's check-ins it hasn't confirmed yet laid over it. */
	function merge(list: DoorTicket[]): DoorTicket[] {
		const mine = new Map(pending.map((entry) => [entry.code, entry.at]));
		return list.map((ticket) => (ticket.checkedInAt || !mine.has(ticket.code) ? ticket : { ...ticket, checkedInAt: mine.get(ticket.code) }));
	}

	async function keep() {
		await saveList(id, { tickets: $state.snapshot(tickets), loadedAt });
		await savePending(id, $state.snapshot(pending));
	}

	/** Sends what's waiting and takes the list back, with every phone's check-ins. */
	async function sync() {
		if (syncing) return;
		syncing = true;
		const sent = [...pending];
		try {
			const response = await fetch(api, {
				method: sent.length ? 'POST' : 'GET',
				headers: sent.length ? { 'content-type': 'application/json' } : {},
				body: sent.length ? JSON.stringify({ checkIns: sent }) : undefined
			});
			if (!response.ok) throw new Error(`${response.status}`);
			const body = (await response.json()) as { tickets: DoorTicket[]; at: string };
			pending = pending.filter((entry) => !sent.includes(entry));
			tickets = merge(body.tickets);
			loadedAt = body.at;
			failed = false;
			await keep();
		} catch {
			failed = true;
		} finally {
			syncing = false;
		}
	}

	function signal(ok: boolean) {
		navigator.vibrate?.(ok ? 120 : [90, 60, 90, 60, 90]);
	}

	async function check(text: string) {
		const verdict = admit(byCode, text);
		result = verdict;
		signal(verdict.ok);
		if (!verdict.ok) return;
		const at = new Date().toISOString();
		tickets = tickets.map((ticket) => (ticket.code === verdict.ticket.code ? { ...ticket, checkedInAt: at } : ticket));
		pending = [...pending, { code: verdict.ticket.code, at }];
		await keep();
		void sync();
	}

	function submitCode(event: SubmitEvent) {
		event.preventDefault();
		if (!code.trim()) return;
		void check(code.replace(/\s+/g, ''));
		code = '';
	}

	let last = { code: '', at: 0 };
	async function startScan() {
		try {
			// Without https (or on an old browser) there is no mediaDevices at all.
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
		} catch {
			noCamera = true;
			return;
		}
		scanning = true;
		noCamera = false;
		// The <video> only exists once Svelte has drawn the scanning state.
		await tick();
		if (!video) return stopScan();
		video.srcObject = stream;
		await video.play().catch(() => {});
		const read = await codeReader();
		const loop = async () => {
			if (!scanning || !video) return;
			const text = await read(video).catch(() => null);
			// The same code held in front of the camera counts once.
			if (text && (text !== last.code || Date.now() - last.at > 4000)) {
				last = { code: text, at: Date.now() };
				await check(text);
			}
			setTimeout(loop, 150);
		};
		void loop();
	}

	function stopScan() {
		scanning = false;
		stream?.getTracks().forEach((track) => track.stop());
		stream = undefined;
	}

	onMount(() => {
		void (async () => {
			const [saved, waiting] = await Promise.all([loadList(id).catch(() => undefined), loadPending(id).catch(() => [])]);
			pending = waiting;
			if (saved) {
				tickets = merge(saved.tickets);
				loadedAt = saved.loadedAt;
			}
			await sync();
			// The reader is fetched now, while there's reception, so it works offline later.
			void codeReader().catch(() => {});
		})();
		const onOnline = () => void sync();
		window.addEventListener('online', onOnline);
		// Other phones' check-ins come in every half minute while there's reception.
		const timer = setInterval(() => navigator.onLine && void sync(), 30_000);
		return () => {
			window.removeEventListener('online', onOnline);
			clearInterval(timer);
			stopScan();
		};
	});
</script>

<Title title="{t.tickets.door} · {data.concert.title}" />

<Crumbs items={[{ href: '/kalender', label: t.concerts.title }, { href: `/kalender/${encodeURIComponent(data.concert.id)}`, label: data.concert.title }]} />

<header class="head">
	<h1>{t.tickets.door}</h1>
	<p class="muted">{data.concert.title} · {data.concert.date.long}</p>
	<p class="counter" aria-live="polite">{d.counter(inside, tickets.length)}</p>
</header>

<!-- First on the phone: the camera, and right under it what it read. -->
<section class="scan">
	{#if scanning}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} autoplay playsinline muted></video>
	{:else}
		<button class="btn big" onclick={startScan} disabled={!loadedAt}><Icon name="eye" size={20} />{d.scan}</button>
	{/if}

	<!-- The verdict, large enough to read at arm's length: green to let in, red to stop. -->
	{#if result}
		<div class="verdict" class:yes={result.ok} class:no={!result.ok} role="status" aria-live="assertive">
			{#if result.ok}
				<strong>{d.welcome}</strong>
				<span>{result.ticket.seat || t.tickets.ticket.freeSeating} · {result.ticket.type}</span>
				<span>{result.ticket.name}</span>
			{:else if result.reason === 'used'}
				<strong>{d.used(time(result.ticket.checkedInAt!))}</strong>
				<span>{result.ticket.name}</span>
			{:else}
				<strong>{d.unknown}</strong>
			{/if}
		</div>
	{/if}

	{#if scanning}<button class="btn secondary" onclick={stopScan}><Icon name="x" size={18} />{d.stop}</button>{/if}
	{#if noCamera}<p class="msg info">{d.noCamera}</p>{/if}
	{#if !loadedAt && !syncing}<p class="msg info">{failed ? d.loadFailed : d.noList}</p>{/if}
</section>

<section class="search">
	<form class="manual" onsubmit={submitCode}>
		<label class="field">
			<span>{d.code}</span>
			<input bind:value={code} autocomplete="off" autocapitalize="characters" spellcheck="false" />
		</label>
		<button class="btn secondary" disabled={!loadedAt}>{d.check}</button>
	</form>

	<label class="field">
		<span>{d.search}</span>
		<input bind:value={query} type="search" autocomplete="off" />
	</label>
	{#if found.length}
		<ul class="ui-list">
			{#each found as ticket (ticket.code)}
				<li>
					<span class="who">
						<strong>{ticket.name}</strong>
						<span class="muted">{ticket.type}{ticket.seat ? ` · ${ticket.seat}` : ''}</span>
					</span>
					{#if ticket.checkedInAt}
						<span class="muted">{d.admitted} {time(ticket.checkedInAt)}</span>
					{:else}
						<button class="btn small" onclick={() => check(ticket.code)}>{d.admit}</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<!-- Housekeeping last: where the list stands, and loading it again. -->
<div class="status">
	<span class="muted">{loadedAt ? d.loaded(tickets.length, time(loadedAt)) : d.noList}</span>
	{#if pending.length}<span class="pending">{d.pending(pending.length)}</span>{:else if loadedAt && !failed}<span class="ok"><Icon name="check" size={14} />{d.synced}</span>{/if}
	<button class="btn small secondary" onclick={sync} disabled={syncing}>{loadedAt ? d.reload : d.load}</button>
</div>
{#if failed && loadedAt}<p class="msg info">{d.offline}</p>{/if}

<style>
	.head {
		display: grid;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}

	.muted {
		color: var(--text-muted);
	}

	.counter {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--hairline);
		font-size: var(--text-sm);
	}

	.status .btn {
		margin-left: auto;
	}

	.pending {
		color: var(--warn);
		font-weight: 600;
	}

	.ok {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ok);
	}

	.verdict {
		--tone: var(--ok);
		display: grid;
		gap: var(--space-1);
		padding: var(--space-5);
		border-radius: var(--radius-l);
		background: color-mix(in oklab, var(--tone) 22%, var(--surface));
		border: 2px solid var(--tone);
		font-size: var(--text-lg);
		text-align: center;
	}

	.verdict.no {
		--tone: var(--danger);
	}

	.verdict strong {
		font-size: var(--text-2xl);
	}

	.scan,
	.search {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	video {
		width: 100%;
		aspect-ratio: 4 / 3;
		/* Short enough that the verdict below stays on screen. */
		max-height: 40vh;
		border-radius: var(--radius-l);
		background: #000;
		object-fit: cover;
	}

	.big {
		height: 64px;
		font-size: var(--text-lg);
	}

	.manual {
		display: flex;
		align-items: end;
		gap: var(--space-2);
	}

	.manual .field {
		flex: 1;
	}

	.search li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
	}

	.who {
		display: grid;
		min-width: 0;
	}
</style>
