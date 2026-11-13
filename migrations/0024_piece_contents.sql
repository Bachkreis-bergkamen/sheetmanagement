-- A medley's songs ("Inhalt"), one per line with its composer: "Habanera – Bizet". The
-- composers come from there when "Komponist" is empty. Written from src/lib/server/db/schema.ts
-- like 0009; a test checks that the migrations give its tables.
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "pieces" ADD COLUMN "contents" TEXT;
