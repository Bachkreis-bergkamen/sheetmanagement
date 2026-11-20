-- Saves that happen once (#191): a form sent from the app carries a request id, and the server
-- remembers what the save answered for a day. A double tap or a retry after a lost answer gets
-- that answer again instead of saving a second time.
-- key is a hash of the account and the request id, so the table says nothing about who saved.
-- body is NULL while the save is still running; the save's answer once it has one.
-- Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS request_log (
	key TEXT PRIMARY KEY,
	status INTEGER,
	body TEXT,
	started_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS request_log_started ON request_log (started_at);
