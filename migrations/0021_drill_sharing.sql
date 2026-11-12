-- What members choose to share from the Übebereich (#300): a summary per day and skill, never
-- answers or audio. Only members who turned sharing on have rows; turning it all off deletes
-- them. Young players appear on the board and to the leaders only once a parent agreed.
-- Every statement must be safe to run twice.

-- One row per member who shares anything: with the weekly board, the leaders, their parents.
CREATE TABLE IF NOT EXISTS drill_sharing (
	email TEXT PRIMARY KEY,
	board INTEGER NOT NULL DEFAULT 0,
	leaders INTEGER NOT NULL DEFAULT 0,
	parents INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A day's summary of one skill ("notes", "scale", "sight"), as the device sent it last.
CREATE TABLE IF NOT EXISTS drill_days (
	email TEXT NOT NULL,
	day TEXT NOT NULL,
	skill TEXT NOT NULL,
	answers INTEGER NOT NULL,
	right_answers INTEGER NOT NULL,
	seconds INTEGER NOT NULL,
	PRIMARY KEY (email, day, skill)
);

-- A parent's consent that their child may appear on the board and to the leaders.
CREATE TABLE IF NOT EXISTS drill_parent_consent (
	child TEXT PRIMARY KEY,
	parent TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
