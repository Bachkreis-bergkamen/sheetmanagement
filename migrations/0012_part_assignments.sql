-- Who plays which part instead of their own (#262): the "Stimmenzuteilung" tab. Written from
-- src/lib/server/db/schema.ts like 0009; a test checks that the migrations give its tables.

CREATE TABLE IF NOT EXISTS "part_assignments" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"rev" INTEGER NOT NULL DEFAULT 0,
	"who" TEXT,
	"part" TEXT,
	"piece_id" INTEGER REFERENCES "pieces" ("id") ON DELETE RESTRICT,
	"piece" TEXT,
	"concert_id" INTEGER REFERENCES "concerts" ("id") ON DELETE RESTRICT,
	"concert" TEXT,
	"by" TEXT,
	"at" TEXT,
	"sheet_id" TEXT,
	"updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE ("sheet_id")
);
