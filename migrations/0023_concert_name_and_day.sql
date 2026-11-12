-- A concert is its name and its day (#330): the Weihnachtskonzert 1957 and the one 1958 may
-- share "Weihnachtskonzert". The unique "title_key" now holds the name and the day, as
-- concertKey() in src/lib/repertoire/concert-ref.ts writes it: the name as compared, a unit
-- separator, then the day as "1957-12-21", "1957-12" or "1957". Dates written another way
-- than these keep their text; the next save of that row writes the key the app's way.
-- Every statement must be safe to run twice: rows that already have the separator are left.

UPDATE concerts
SET title_key = title_key || char(31) || CASE
	WHEN trim(coalesce(date, '')) GLOB '[0-9][0-9].[0-9][0-9].[0-9][0-9][0-9][0-9]'
		THEN substr(trim(date), 7, 4) || '-' || substr(trim(date), 4, 2) || '-' || substr(trim(date), 1, 2)
	WHEN trim(coalesce(date, '')) GLOB '[0-9][0-9].[0-9][0-9][0-9][0-9]'
		THEN substr(trim(date), 4, 4) || '-' || substr(trim(date), 1, 2)
	ELSE lower(trim(coalesce(date, '')))
END
WHERE title_key IS NOT NULL AND instr(title_key, char(31)) = 0;
