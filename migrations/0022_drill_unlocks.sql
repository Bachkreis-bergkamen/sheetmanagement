-- Drills of the Übebereich an administrator opened for a member (#327), whatever their own
-- progress says: a professional who shouldn't climb from the start, or a teacher's choice.
-- Progress itself stays on the member's device; this is only which drills are open.
-- Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS drill_unlocks (
	email TEXT NOT NULL,
	card TEXT NOT NULL,
	granted_by TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (email, card)
);
