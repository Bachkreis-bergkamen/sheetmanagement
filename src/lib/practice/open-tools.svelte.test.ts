import { describe, expect, it } from 'vitest';
import { OpenTools } from './open-tools.svelte.ts';

describe('OpenTools', () => {
	it('shows one tool at a time and keeps each opened one', () => {
		const tools = new OpenTools();
		tools.choose('metronome');
		tools.choose('tuner');
		expect(tools.active).toBe('tuner');
		expect(tools.opened).toEqual(['metronome', 'tuner']);
		tools.choose('tuner');
		expect(tools.active).toBeNull();
		tools.choose('metronome');
		tools.close();
		expect(tools.active).toBeNull();
		expect(tools.opened).toEqual(['metronome', 'tuner']);
	});
});
