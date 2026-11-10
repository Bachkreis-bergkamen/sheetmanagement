import { describe, expect, it, vi } from 'vitest';

vi.mock('./env.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('./env.ts')>()),
	appEnv: () => ({ DEMO: 'true' }),
	isDemo: () => true
}));

const { config } = await import('#lib/config/index.ts');
const { buildCatalog } = await import('#lib/music/catalog.ts');
const { pieceStatus } = await import('./library.ts');

const pdf = (id: string, name: string) => ({ id, name, mimeType: 'application/pdf' });
const catalog = buildCatalog(
	{
		version: 3,
		archiveFolderId: 'root',
		builtAt: '',
		requestCount: 0,
		programs: [],
		categoryFiles: [],
		pieces: [
			{ folderId: 'ok', name: 'Fame', files: [pdf('a1', 'Fame - Partitur.pdf'), pdf('a2', 'Fame - Flöte.pdf'), pdf('a3', 'Fame - Geige I.pdf')] },
			{ folderId: 'pages', name: 'Swing', files: [pdf('b1', 'Swing - Flöte.pdf'), pdf('b2', 'Swing - Geige I UNVOLLSTÄNDIG.pdf')] }
		]
	},
	config
);

describe('pieceStatus', () => {
	const fame = catalog.byId.get('ok')!;

	it('marks voices of the Besetzung without a part as missing (#249)', () => {
		expect(pieceStatus(fame, 'Flöte; Geige 1 & 2', config)).toBe('missing');
	});

	it('keeps the status when every voice has a part, or no Besetzung is entered', () => {
		expect(pieceStatus(fame, 'Flöte; Geige 1', config)).toBe('ok');
		expect(pieceStatus(fame, undefined, config)).toBe('ok');
	});

	it('lets missing voices outrank missing pages', () => {
		const swing = catalog.byId.get('pages')!;
		expect(swing.status).toBe('incomplete');
		expect(pieceStatus(swing, 'Flöte; Geige 1', config)).toBe('incomplete');
		expect(pieceStatus(swing, 'Flöte; Oboe; Geige 1', config)).toBe('missing');
	});
});
