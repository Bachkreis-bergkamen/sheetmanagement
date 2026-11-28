-- A piece's background ("Wissenswertes", #411): where it comes from, its history, stories to
-- tell. For the Moderation and the Programmheft. Written from src/lib/server/db/schema.ts like
-- 0024; a test checks that the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "pieces" ADD COLUMN "facts" TEXT;
