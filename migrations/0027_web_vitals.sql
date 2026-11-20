-- How fast the app is on members' own devices (#187): LCP, INP and TTFB as the browser measured
-- them, counted per day, route pattern, kind of device and bucket, so the status page can show
-- the p75 without one visit being stored. Nothing names a person or an address.
-- Kept for 180 days, like the page counts (jobs/retention.ts). Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS web_vitals (
	day TEXT NOT NULL,
	route TEXT NOT NULL,
	device TEXT NOT NULL,
	metric TEXT NOT NULL,
	bucket INTEGER NOT NULL,
	count INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (day, route, device, metric, bucket)
);
