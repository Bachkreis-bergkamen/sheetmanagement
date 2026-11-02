-- Scan jobs: in "Fehlende Stimmen", which gap comes first and who scans it. Written from
-- src/lib/server/db/schema.ts like 0009; a test checks that the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "missing_parts" ADD COLUMN "priority" TEXT;
ALTER TABLE "missing_parts" ADD COLUMN "assignee" TEXT;
