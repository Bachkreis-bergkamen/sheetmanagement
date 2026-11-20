import type { Texts } from '../types.ts';

/** The season report for the annual meeting (#147). */
export const season: Texts['season'] = {
	title: 'Season report',
	lead: 'What happened in a period, to print for the annual general meeting. Attendance only as totals, without names.',
	back: 'History',
	from: 'From',
	to: 'To',
	show: 'Show',
	print: 'Print',
	presets: {
		twelve: 'Last 12 months',
		season: (label: string) => `Season ${label}`,
		lastYear: (year: number) => `${year}`,
		thisYear: (year: number) => `${year}`
	},
	presetsLabel: 'Period',
	heading: (orchestra: string) => `Season report ${orchestra}`,
	figures: 'At a glance',
	concerts: (n: number) => (n === 1 ? 'concert' : 'concerts'),
	pieces: (n: number) => (n === 1 ? 'piece played' : 'pieces played'),
	debuts: 'of them for the first time',
	rehearsals: (n: number) => (n === 1 ? 'rehearsal' : 'rehearsals'),
	concertsTitle: 'Concerts and programmes',
	noConcerts: 'There was no concert in this period.',
	noProgram: 'Programme not entered',
	firstTime: 'first time',
	debutsTitle: 'Played for the first time',
	noDebuts: 'No piece was new to the repertoire.',
	debutAt: (concert: string) => `at ${concert}`,
	rehearsalsTitle: 'Rehearsals',
	rehearsalCount: (n: number) => (n === 1 ? '1 rehearsal took place.' : `${n} rehearsals took place.`),
	noCalendar: 'The calendar is not connected, so rehearsals are missing.',
	attendance: (rehearsals: number, average: string, rate: number) =>
		`Attendance was taken at ${rehearsals === 1 ? '1 rehearsal' : `${rehearsals} rehearsals`}: ${average} people on average, ${rate} % of those listed.`,
	noAttendance: 'No attendance was taken in this period.',
	archiveTitle: 'Library and taking part',
	reports: (made: number, done: number) =>
		`${made === 1 ? '1 problem with sheet music was' : `${made} problems with sheet music were`} reported, ${done} of them ${done === 1 ? 'is' : 'are'} done.`,
	wishes: (n: number) => (n === 1 ? '1 wish was submitted.' : `${n} wishes were submitted.`),
	created: (day: string) => `Created on ${day}. Rehearsals come from the calendar, which reaches back three years.`
};
