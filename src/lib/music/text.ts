/**
 * Splits a file name into lower-case word tokens so that "Best_of_Bach-ViolinII",
 * "Violin II" and "violin 2" all look alike to the parser.
 * Kept as separate tokens: "+", "&", "/", "," (joins) and "–" (a range like "1-3").
 */
export function tokenize(input: string): string[] {
	return (
		input
			// "Querfl”Te": ö mangled by an old encoding conversion
			.replace(/”t/gi, 'öt')
			.replace(/”/g, 'ö')
			// English ordinals stay one token ("1st"); the § keeps the split below off them.
			.replace(/(\d)(st|nd|rd|th)(?![a-z])/gi, '$1§$2')
			// camelCase and glued numbers: "ViolinII" → "Violin II", "Clari1" → "Clari 1"
			.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2')
			.replace(/([A-Za-zÄÖÜäöüß])(\d)/g, '$1 $2')
			.replace(/(\d)([A-Za-zÄÖÜäöüß])/g, '$1 $2')
			.replace(/(\d)\s*-\s*(\d)/g, '$1 – $2')
			.replace(/([+&/,–:])/g, ' $1 ')
			.replace(/[_\-.()[\]"'!?´`]+/g, ' ')
			.toLowerCase()
			.split(/\s+/)
			.filter(Boolean)
			.map((token) => token.replace('§', ''))
	);
}

/** "1st", "2nd": unlike a bare number, these always belong to the instrument after them. */
export const isOrdinal = (token: string | undefined) => !!token && /^[1-8](?:st|nd|rd|th)$/.test(token);

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** "2", "ii" → 2. Only small numbers, which is what part numbers are. */
export function parseNumeral(token: string | undefined): number | undefined {
	if (!token) return undefined;
	if (/^[1-8]$/.test(token)) return Number(token);
	if (isOrdinal(token)) return Number(token[0]);
	const roman = ROMAN.indexOf(token.toUpperCase());
	return roman > 0 ? roman : undefined;
}

/** [1, 2] → "I & II", [1, 2, 3] → "I–III". */
export function formatNumbers(numbers: number[]): string {
	if (numbers.length === 0) return '';
	const consecutive = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
	if (numbers.length > 2 && consecutive) {
		return `${ROMAN[numbers[0]]}–${ROMAN[numbers[numbers.length - 1]]}`;
	}
	return numbers.map((n) => ROMAN[n]).join(' & ');
}

/** For search: lower case, without accents, "ß" → "ss". */
export function searchText(...parts: (string | undefined)[]): string {
	return parts
		.filter(Boolean)
		.join(' ')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ß/g, 'ss')
		.toLowerCase();
}

/** Letters only, lower case, without accents: "Tschaikowski" and "Tschaikowsky" become close. */
export const bare = (text: string) => searchText(text).replace(/[^a-z]/g, '');

/** How many letters to change to turn one text into the other (Levenshtein). */
export function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let previous = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const current = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
			previous = current;
		}
	}
	return row[b.length];
}

/**
 * Old file names repeat the piece title in every file ("Best_of_Bach-ViolinI.pdf").
 * Returns that shared prefix, cut back to the last "-" or "_" so no instrument is cut.
 */
export function sharedPrefix(names: string[]): string {
	if (names.length < 2) return '';
	let prefix = names[0];
	for (const name of names.slice(1)) {
		let i = 0;
		while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
		prefix = prefix.slice(0, i);
		if (!prefix) return '';
	}
	const cut = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf('_'));
	return cut > 0 ? prefix.slice(0, cut + 1) : '';
}
