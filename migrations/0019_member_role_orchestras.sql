-- Roles for some orchestras belong to the person, not the role (#305 follow-up): "Dirigat (A, B)"
-- in a member's Gruppen cell makes them the Dirigat of A and B. The role-wide "Orchester" column
-- of Gruppen from 0018 goes; where it was set, its orchestras move onto each member who holds
-- the role and named no orchestras for it, so nobody gains rights by the change.
-- Runs once, in one batch with its bookkeeping row: DROP COLUMN can't be repeated.

UPDATE "members" SET "groups" = (
	SELECT group_concat(part, ', ') FROM (
		SELECT CASE
			WHEN instr(role.value, '(') = 0 AND g."orchestras" IS NOT NULL AND trim(g."orchestras") <> ''
				THEN trim(role.value) || ' (' || trim(g."orchestras") || ')'
			ELSE trim(role.value)
		END AS part
		FROM json_each('["' || replace(replace(replace(replace("members"."groups", '"', ''), char(92), ''), char(59), ','), ',', '","') || '"]') AS role
		LEFT JOIN "access_groups" AS g ON lower(trim(g."name")) = lower(trim(role.value))
		WHERE trim(role.value) <> ''
		ORDER BY role.key
	)
)
WHERE "groups" IS NOT NULL AND trim("groups") <> '' AND instr("groups", '(') = 0
	AND EXISTS (SELECT 1 FROM "access_groups" WHERE "orchestras" IS NOT NULL AND trim("orchestras") <> '');

ALTER TABLE "access_groups" DROP COLUMN "orchestras";
