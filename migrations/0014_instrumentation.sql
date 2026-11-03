-- A piece's Besetzung (#249): the instruments its score is written for, read from the score or
-- typed in, so a part missing for one of them shows. Written from src/lib/server/db/schema.ts
-- like 0009; a test checks that the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "pieces" ADD COLUMN "instrumentation" TEXT;
