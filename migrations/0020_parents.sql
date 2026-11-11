-- Parents of young players: a parent account (status "eltern") names its children in the new
-- "Kinder" column of Mitglieder and sees only its own area, /eltern. Written from
-- src/lib/server/db/schema.ts like 0009; a test checks that the migrations give its tables.
-- The notices to parents live in their own table, made by the app on first use.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "members" ADD COLUMN "children" TEXT;
