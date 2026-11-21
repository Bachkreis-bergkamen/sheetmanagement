import type { Texts } from '../types.ts';

/** Parts of the app that can be turned off (#134), by their key in src/lib/features.ts. */
export const features: Texts['features'] = {
	loans: 'Rentals',
	musicReport: 'Music report',
	attendance: 'Attendance',
	signups: 'Sign-ups',
	wishes: 'Wishes',
	calendarFeed: 'Calendar feed',
	seasons: 'Seasons',
	tickets: 'Concert tickets',
	offline: 'Save parts offline',
	drills: 'Practice room',
	trips: 'Trips',
	lending: 'Instruments on loan'
};
