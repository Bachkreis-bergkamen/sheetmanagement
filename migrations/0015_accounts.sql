-- Email and password sign-in: one row per person who set a password. Only the hash is kept
-- (PBKDF2, see src/lib/server/auth/password.ts); the stamp changes with every new password,
-- which ends the sessions and the set-password links made with the old one.
-- Every statement must be safe to run twice.

CREATE TABLE IF NOT EXISTS accounts (
	email TEXT PRIMARY KEY,
	password_hash TEXT NOT NULL,
	stamp TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
