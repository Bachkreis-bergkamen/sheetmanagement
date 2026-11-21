-- More addresses per member (#190): the new "Weitere Adressen" column of Mitglieder lists the
-- other addresses a member signs in with, e.g. the school's next to a private one. Signing in
-- with any of them leads to the same member, under the address in "E-Mail".
-- Runs once, in one batch with its bookkeeping row: ADD COLUMN can't be repeated.

ALTER TABLE "members" ADD COLUMN "aliases" TEXT;
