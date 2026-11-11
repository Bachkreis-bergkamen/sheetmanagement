<script lang="ts">
	import { t } from '#lib/i18n/index.ts';

	/**
	 * A member's roles in /admin, each maybe for some orchestras only (#305): "Dirigat" ticked with
	 * A and B makes this person the Dirigat of A and B. Sends "group" per role and
	 * "orchestra:<role>" per orchestra; read on the server with rolesFromForm.
	 */
	let {
		names,
		roles,
		orchestras
	}: {
		/** Every role to offer: the sheet's and the ones this member has. */
		names: string[];
		/** The member's roles as saved; no orchestras: all of them. */
		roles: { name: string; orchestras: string[] }[];
		/** The configured orchestras; with only one there is nothing to pick. */
		orchestras: string[];
	} = $props();

	// svelte-ignore state_referenced_locally
	let held = $state<Record<string, boolean>>(Object.fromEntries(roles.map((role) => [role.name, true])));
	// svelte-ignore state_referenced_locally
	let only = $state<Record<string, boolean>>(Object.fromEntries(roles.map((role) => [role.name, role.orchestras.length > 0])));
	const saved = (name: string) => roles.find((role) => role.name === name)?.orchestras ?? [];
</script>

<ul class="roles">
	{#each names as name (name)}
		<li>
			<label class="check"><input type="checkbox" name="group" value={name} bind:checked={held[name]} />{name}</label>
			{#if held[name] && orchestras.length > 1}
				<div class="scope">
					<label class="check small">
						<input type="checkbox" bind:checked={only[name]} />{t.admin.roleOnlyFor}
					</label>
					{#if only[name]}
						<span class="checks" role="group" aria-label={t.admin.roleOrchestrasFor(name)}>
							{#each orchestras as orchestra (orchestra)}
								<label class="check small">
									<input type="checkbox" name={`orchestra:${name}`} value={orchestra} checked={saved(name).includes(orchestra)} />{orchestra}
								</label>
							{/each}
						</span>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>
<span class="hint">{t.admin.roleOrchestrasHint}</span>

<style>
	.roles {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.scope {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		margin: var(--space-1) 0 0 calc(18px + var(--space-2));
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 32px;
		cursor: pointer;
	}

	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}

	.small {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
