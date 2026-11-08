-- How often each page is opened (#185), for the page audit: one counter per day, route and
-- role. The route is the pattern ("/stuecke/[id]"), never an id; nothing names a person.
-- Kept for 180 days (see jobs/retention.ts). Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS page_counts (
	day TEXT NOT NULL,
	route TEXT NOT NULL,
	role TEXT NOT NULL,
	views INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (day, route, role)
);
