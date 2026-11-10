-- Reports become scan jobs: once an organiser hands a report to the scanning team, it keeps how
-- urgent it is, who scans it and what to do. Written from src/lib/server/db/schema.ts like 0013;
-- a test checks that the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "reports" ADD COLUMN "priority" TEXT;
ALTER TABLE "reports" ADD COLUMN "assignee" TEXT;
ALTER TABLE "reports" ADD COLUMN "task" TEXT;
