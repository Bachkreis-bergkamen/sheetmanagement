/**
 * A small PDF for the demo's sample parts, one page unless asked for more: title, composer and part as real text
 * (so "Aus den Noten lesen" finds them) above a few empty staves. Written by hand: the
 * format needs only a handful of objects and a table of their byte offsets.
 */

/** PDF text strings: brackets and backslashes escaped; Latin-1, so umlauts work with WinAnsi. */
const pdfText = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\xff]/g, '?');

export function samplePdf({
	title,
	composer,
	arranger,
	part,
	pages = 1,
	staves = []
}: {
	title: string;
	composer?: string;
	arranger?: string;
	part: string;
	/** The same page this many times, for the completeness check (#93). */
	pages?: number;
	/** A score's instruments, one staff each with its name at the left, as scores print them (#249). */
	staves?: string[];
}): Uint8Array<ArrayBuffer> {
	const width = 595;
	const height = 842;
	const lines: string[] = [];
	const text = (x: number, y: number, size: number, value: string, font = 'F1') =>
		lines.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`);
	text(56, 790, 11, part, 'F2');
	text(56, 750, 24, title, 'F2');
	if (composer) text(400, 724, 11, composer);
	if (arranger) text(400, 708, 10, `arr. ${arranger}`);
	text(56, 40, 8, 'Demo-Noten · Sheetmanagement');
	// Staves: five lines each, 7 pt apart; a score's closer together, its names left of them.
	const count = staves.length || 9;
	const gap = staves.length ? Math.min(68, 600 / count) : 68;
	const left = staves.length ? 130 : 56;
	for (let staff = 0; staff < count; staff++) {
		const top = 660 - staff * gap;
		if (staves[staff]) text(56, top - 20, 8, staves[staff]);
		for (let line = 0; line < 5; line++) lines.push(`${left} ${top - line * 7} m ${width - 56} ${top - line * 7} l S`);
	}
	const content = `0.4 w\n${lines.join('\n')}`;

	// Catalog, page tree, content and fonts first; then one page object per page, all drawing the same content.
	const kids = Array.from({ length: pages }, (_, i) => `${6 + i} 0 R`).join(' ');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
		`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
		...Array.from(
			{ length: pages },
			() => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 3 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>`
		)
	];
	let out = '%PDF-1.4\n';
	const offsets: number[] = [];
	objects.forEach((object, i) => {
		offsets.push(out.length);
		out += `${i + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = out.length;
	out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
	out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	// One byte per character (Latin-1), so the offsets above are byte offsets.
	return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
