/**
 * The tools of the practice viewer (PracticeScore), such as the recording, metronome and
 * tuner: one shown at a time, and each once opened stays mounted, so a metronome or drone
 * keeps going while another is shown or the panel is closed.
 */
export class OpenTools {
	/** The tool shown. */
	active = $state<string | null>(null);
	opened = $state<string[]>([]);

	/** Shows a tool, or closes it when it's the one shown. */
	choose(tool: string) {
		this.active = this.active === tool ? null : tool;
		if (this.active && !this.opened.includes(this.active)) this.opened = [...this.opened, this.active];
	}

	close() {
		this.active = null;
	}
}
