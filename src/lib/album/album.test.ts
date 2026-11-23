import { describe, expect, it } from 'vitest';
import {
	albumDay,
	albumGroups,
	albumHref,
	albumKey,
	albumWhen,
	albumYears,
	cleanText,
	clockSeconds,
	clockText,
	embedUrl,
	formatBytes,
	imageType,
	kindOfEvent,
	mayRemovePhoto,
	parseAlbumKey,
	parseFilter,
	PHOTOS_PER_DAY,
	storageBudget,
	uploadRefusal,
	videoLink,
	visiblePhotos,
	type AlbumPhoto
} from './album.ts';

const photo = (id: string, album: string, day: string, extra: Partial<AlbumPhoto> = {}): AlbumPhoto => ({
	id,
	album,
	kind: 'konzert',
	title: album,
	day,
	status: 'approved',
	public: false,
	email: 'mia@example.org',
	name: 'Mia',
	width: 1600,
	height: 1067,
	type: 'image/jpeg',
	bytes: 400_000,
	createdAt: '2026-11-01T10:00:00Z',
	...extra
});

describe('album keys', () => {
	it('names a date, a trip or an album of its own, and reads them back', () => {
		expect(albumKey('termin', 'abc_123')).toBe('termin:abc_123');
		expect(parseAlbumKey('fahrt:x:y')).toEqual({ type: 'fahrt', id: 'x:y' });
		expect(parseAlbumKey('nope:1')).toBeNull();
		expect(parseAlbumKey('termin:')).toBeNull();
		expect(albumHref('album:a b')).toBe('/fotos/album/a%20b');
	});

	it('sorts calendar dates into the album kinds', () => {
		expect([kindOfEvent('konzert'), kindOfEvent('generalprobe'), kindOfEvent('probe'), kindOfEvent('sonstiges')]).toEqual(['konzert', 'probe', 'probe', 'sonstiges']);
	});
});

describe('imageType', () => {
	it('goes by the first bytes, not by the name', () => {
		expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
		expect(imageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
		expect(imageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
		expect(imageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
		expect(imageType(new Uint8Array())).toBeNull();
	});
});

describe('texts and dates from the forms', () => {
	it('trims text and refuses what is empty or too long', () => {
		expect(cleanText('  Schön war’s!\r\n\n\n\nWieder so.  ', 100)).toBe('Schön war’s!\n\nWieder so.');
		expect(cleanText('   ', 100)).toBeNull();
		expect(cleanText('x'.repeat(11), 10)).toBeNull();
		expect(cleanText(undefined, 10)).toBeNull();
	});

	it('takes a year back to 1969, with month and day when known', () => {
		const today = '2026-11-23';
		expect(albumDay('1969', '', '', today)).toBe('1969');
		expect(albumDay('1975', '6', '', today)).toBe('1975-06');
		expect(albumDay('1975', '6', '7', today)).toBe('1975-06-07');
		expect(albumDay('1968', '', '', today)).toBeNull();
		expect(albumDay('2027', '', '', today)).toBeNull();
		expect(albumDay('2026', '12', '', today)).toBeNull();
		expect(albumDay('1975', '', '7', today)).toBeNull();
		expect(albumDay('1975', '2', '30', today)).toBeNull();
		expect(albumDay('abc', '', '', today)).toBeNull();
	});

	it('says a date as exactly as it is known', () => {
		expect(albumWhen('1969', 'de-DE')).toBe('1969');
		expect(albumWhen('1972-06', 'de-DE')).toBe('Juni 1972');
		expect(albumWhen('1972-06-17', 'de-DE')).toContain('17. Juni 1972');
		expect(albumWhen('', 'de-DE')).toBe('');
	});
});

describe('who sees and removes what', () => {
	const mine = photo('1', 'termin:a', '2026-11-01', { status: 'pending', email: 'mia@example.org' });
	const theirs = photo('2', 'termin:a', '2026-11-01', { status: 'pending', email: 'paul@example.org' });
	const approved = photo('3', 'termin:a', '2026-11-01', { email: 'paul@example.org' });

	it('shows approved photos to all, waiting ones to who uploaded them and to those who approve', () => {
		expect(visiblePhotos([mine, theirs, approved], { email: 'mia@example.org', approves: false }).map((p) => p.id)).toEqual(['1', '3']);
		expect(visiblePhotos([mine, theirs, approved], { email: 'vera@example.org', approves: true }).map((p) => p.id)).toEqual(['1', '2', '3']);
	});

	it('lets who uploaded and who approves take a photo away', () => {
		expect(mayRemovePhoto(approved, { email: 'mia@example.org', approves: false })).toBe(false);
		expect(mayRemovePhoto(approved, { email: 'paul@example.org', approves: false })).toBe(true);
		expect(mayRemovePhoto(approved, { email: 'vera@example.org', approves: true })).toBe(true);
	});
});

describe('the album page', () => {
	const photos = [
		photo('a1', 'termin:herbst', '2026-11-14'),
		photo('a2', 'termin:herbst', '2026-11-14'),
		photo('w', 'termin:herbst', '2026-11-14', { status: 'pending' }),
		photo('f1', 'fahrt:rom', '2025-05-01', { kind: 'fahrt' }),
		photo('o1', 'album:fest', '1975-06', { kind: 'sonstiges' }),
		photo('o2', 'album:gruendung', '1969', { kind: 'sonstiges' })
	];

	it('groups approved photos by album, newest first, the first photo as cover', () => {
		const groups = albumGroups(photos);
		expect(groups.map((g) => [g.album, g.count, g.cover])).toEqual([
			['termin:herbst', 2, 'a1'],
			['fahrt:rom', 1, 'f1'],
			['album:fest', 1, 'o1'],
			['album:gruendung', 1, 'o2']
		]);
		expect(groups[0].preview).toEqual(['a1', 'a2']);
	});

	it('filters by kind, year and decade', () => {
		expect(albumGroups(photos, { kind: 'sonstiges' }).map((g) => g.album)).toEqual(['album:fest', 'album:gruendung']);
		expect(albumGroups(photos, { year: '1975' }).map((g) => g.album)).toEqual(['album:fest']);
		expect(albumGroups(photos, { year: '1960er' }).map((g) => g.album)).toEqual(['album:gruendung']);
		expect(albumGroups(photos, { year: '2020er', kind: 'fahrt' }).map((g) => g.album)).toEqual(['fahrt:rom']);
	});

	it('counts recordings in their album, and shows albums of recordings only without a cover', () => {
		const videos = [photo('v1', 'termin:herbst', '2026-11-14'), photo('v2', 'termin:fruehling', '2026-04-01'), photo('v3', 'termin:x', '2026-01-01', { status: 'pending' })];
		const groups = albumGroups(photos, {}, videos);
		expect(groups.find((g) => g.album === 'termin:herbst')).toMatchObject({ count: 2, videos: 1, cover: 'a1' });
		expect(groups.find((g) => g.album === 'termin:fruehling')).toMatchObject({ count: 0, videos: 1, cover: null, preview: [] });
		expect(groups.some((g) => g.album === 'termin:x')).toBe(false);
	});

	it('offers the years with photos, and decades that hold more than one', () => {
		expect(albumYears(photos)).toEqual({ years: ['2026', '2025', '1975', '1969'], decades: ['2020er'] });
	});

	it('reads the filter from the address and ignores what it does not know', () => {
		expect(parseFilter(new URLSearchParams('art=fahrt&jahr=1970er'))).toEqual({ kind: 'fahrt', year: '1970er' });
		expect(parseFilter(new URLSearchParams('art=party&jahr=70'))).toEqual({});
	});
});

describe('staying in R2’s free tier (#408)', () => {
	const GB = 1024 ** 3;

	it('budgets 9 GB unless set lower, and never more than 9.5 GB', () => {
		expect(storageBudget(undefined)).toBe(9 * GB);
		expect(storageBudget('')).toBe(9 * GB);
		expect(storageBudget('2,5')).toBe(2.5 * GB);
		expect(storageBudget('50')).toBe(9.5 * GB);
		expect(storageBudget('nope')).toBe(9 * GB);
		expect(storageBudget('-1')).toBe(9 * GB);
	});

	it('refuses an upload past the budget, past a day’s photos, or with too many waiting', () => {
		const usage = { stored: 8 * GB, budget: 9 * GB, today: 0, waiting: 0, approves: false };
		expect(uploadRefusal({ count: 3, bytes: 3_000_000 }, usage)).toBeNull();
		expect(uploadRefusal({ count: 1, bytes: GB + 1 }, usage)).toBe('full');
		expect(uploadRefusal({ count: 2, bytes: 1 }, { ...usage, today: PHOTOS_PER_DAY - 1 })).toBe('daily');
		expect(uploadRefusal({ count: 2, bytes: 1 }, { ...usage, waiting: 199 })).toBe('waiting');
		// Those who approve are held only by the budget.
		expect(uploadRefusal({ count: 2, bytes: 1 }, { ...usage, today: 500, waiting: 500, approves: true })).toBeNull();
		expect(uploadRefusal({ count: 1, bytes: GB + 1 }, { ...usage, approves: true })).toBe('full');
	});

	it('says sizes in MB and GB', () => {
		expect(formatBytes(340 * 1024 ** 2, 'de-DE')).toBe('340 MB');
		expect(formatBytes(1.25 * GB, 'de-DE')).toBe('1,3 GB');
	});
});

describe('recordings (#408)', () => {
	it('reads the video and its start from any YouTube link', () => {
		expect(videoLink('https://youtu.be/aqz-KE-bpKQ?si=abc&t=95')).toEqual({ youtube: 'aqz-KE-bpKQ', start: 95 });
		expect(videoLink('https://www.youtube.com/watch?v=aqz-KE-bpKQ')).toEqual({ youtube: 'aqz-KE-bpKQ' });
		expect(videoLink('https://vimeo.com/123')).toBeNull();
		expect(videoLink('kein Link')).toBeNull();
	});

	it('reads start times as minutes and hours, and writes them back', () => {
		expect(clockSeconds('')).toBeUndefined();
		expect(clockSeconds('0:00')).toBe(0);
		expect(clockSeconds('12:30')).toBe(750);
		expect(clockSeconds('1:02:03')).toBe(3723);
		expect(clockSeconds('90')).toBe(90);
		expect(clockSeconds('12:75')).toBeNull();
		expect(clockSeconds('zwölf')).toBeNull();
		expect([clockText(750), clockText(3723), clockText(5)]).toEqual(['12:30', '1:02:03', '0:05']);
	});

	it('plays without cookies, from the start time', () => {
		expect(embedUrl('aqz-KE-bpKQ', 750)).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0&start=750');
	});
});
