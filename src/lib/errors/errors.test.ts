import { describe, expect, it } from 'vitest';
import { cleanReport, cspViolation, fingerprint, scrub, scrubPlace } from './errors.ts';

describe('scrub', () => {
	it('takes out addresses, ids, queries and long numbers', () => {
		expect(scrub('No access for anna.berg@example.org')).toBe('No access for <email>');
		expect(scrub('File 1AbCdEfGhIjKlMnOpQrStUv9 not found')).toBe('File <id> not found');
		expect(scrub('Fetch https://www.googleapis.com/drive/v3/files?q=secret failed')).toBe('Fetch https://www.googleapis.com/drive/v3/files failed');
		expect(scrub('Row 123456 is gone')).toBe('Row <n> is gone');
		expect(scrub('Request 3f2a8c1e-1b2c-4d5e-8f90-123456789abc failed')).toBe('Request <id> failed');
	});

	it('keeps the first line, short', () => {
		expect(scrub('TypeError: x is undefined\n    at foo (a.js:1:2)')).toBe('TypeError: x is undefined');
		expect(scrub('a'.repeat(1000))).toHaveLength(300);
	});

	it('leaves ordinary words alone', () => {
		expect(scrub('Cannot read properties of undefined')).toBe('Cannot read properties of undefined');
	});
});

describe('scrubPlace', () => {
	it('keeps route ids, hides ids in addresses', () => {
		expect(scrubPlace('/stuecke/[id]')).toBe('/stuecke/[id]');
		expect(scrubPlace('/kalender/abc123def456?x=1')).toBe('/kalender/<id>');
		expect(scrubPlace('/meine-noten')).toBe('/meine-noten');
	});
});

describe('fingerprint', () => {
	it('is the same for the same kind and differs by side and place', () => {
		const report = { source: 'server' as const, place: '/a', message: 'boom' };
		expect(fingerprint(report)).toBe(fingerprint({ ...report, status: 503 }));
		expect(fingerprint(report)).not.toBe(fingerprint({ ...report, source: 'client' }));
		expect(fingerprint(report)).not.toBe(fingerprint({ ...report, place: '/b' }));
		expect(fingerprint(report)).toMatch(/^s[0-9a-f]{8}$/);
	});
});

describe('cleanReport', () => {
	it('drops reports without a message and odd fields', () => {
		expect(cleanReport({ source: 'client', message: '' })).toBeNull();
		expect(cleanReport({ source: 'client', message: 42 })).toBeNull();
		expect(cleanReport({ source: 'client', message: 'boom', place: 7, status: 'x' })).toEqual({ source: 'client', place: '?', message: 'boom' });
	});
});

describe('cspViolation', () => {
	it('reads the old report and the Reporting API’s, the site without its path', () => {
		expect(
			cspViolation({
				'csp-report': { 'document-uri': 'https://app.test/noten/abc?x=1', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.test/x.js?t=1' }
			})
		).toEqual({ message: 'CSP script-src-elem: https://evil.test', place: '/noten/abc' });
		expect(
			cspViolation([{ type: 'csp-violation', body: { documentURL: 'https://app.test/', effectiveDirective: 'script-src-elem', blockedURL: 'inline' } }])
		).toEqual({ message: 'CSP script-src-elem: inline', place: '/' });
	});

	it('drops extensions and what isn’t a report', () => {
		expect(cspViolation({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'chrome-extension://abc/x.js' } })).toBeNull();
		expect(cspViolation({ message: 'hi' })).toBeNull();
		expect(cspViolation(null)).toBeNull();
	});
});
