-- Photos and videos of members (#299): whether a member may appear in the orchestra's photos and
-- videos (website, programme, social media). A young player's parent answers for them, everyone
-- else for themself. No row: nobody answered yet, which counts as "no".
-- Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS photo_consent (
	email TEXT PRIMARY KEY,
	allowed INTEGER NOT NULL,
	by_email TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
