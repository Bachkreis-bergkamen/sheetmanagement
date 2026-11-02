-- Concerts with other choirs and orchestras: the "Ensembles" tab, who a concert is given with
-- ("Mitwirkende") and who organises it ("Veranstalter"), and on programme rows what the GEMA
-- list needs for pieces the guests bring. Written from src/lib/server/db/schema.ts like 0009;
-- a test checks that 0009 and this give the tables schema.ts describes.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "concerts" ADD COLUMN "partners" TEXT;
ALTER TABLE "concerts" ADD COLUMN "organizer" TEXT;

ALTER TABLE "program_items" ADD COLUMN "composer" TEXT;
ALTER TABLE "program_items" ADD COLUMN "arranger" TEXT;
ALTER TABLE "program_items" ADD COLUMN "publisher" TEXT;
ALTER TABLE "program_items" ADD COLUMN "duration" TEXT;

CREATE TABLE IF NOT EXISTS "ensembles" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"rev" INTEGER NOT NULL DEFAULT 0,
	"short_name" TEXT,
	"short_name_key" TEXT,
	"name" TEXT,
	"kind" TEXT,
	"conductor" TEXT,
	"website" TEXT,
	"logo" TEXT,
	"updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE ("short_name_key"),
	CHECK ("short_name" IS NOT NULL OR "name" IS NOT NULL)
);
