-- The Übebereich's progress per member (#300), so it follows them to their other devices: the
-- whole state as the app keeps it (items, days, settings, badges) as JSON. Devices merge their
-- copy into it rather than replacing it; resetting the progress replaces it, and deleting a
-- member's data deletes it.
-- Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS drill_progress (
	email TEXT PRIMARY KEY,
	data TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
