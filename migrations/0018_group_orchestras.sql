-- A role limited to some orchestras (#305): "Gruppen" gets the orchestras its rights hold for,
-- empty for all of them. Written from src/lib/server/db/schema.ts like 0009; a test checks that
-- the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "access_groups" ADD COLUMN "orchestras" TEXT;
