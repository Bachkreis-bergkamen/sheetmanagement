import type { Texts } from '../types.ts';

/**
 * Tab and column names of the repertoire sheet, for a new English deployment. The app finds
 * columns by these headers; renaming one here means renaming it in existing sheets too.
 */
export const sheet: Texts['sheet'] = {
	pieces: {
		tab: 'Pieces',
		columns: {
			title: 'Title',
			composer: 'Composer',
			/** "Ludwig van Beethoven" where "Composer" says "Beethoven": for the music report (#146). */
			composerFull: 'Composer (full name)',
			catalogue: 'Catalogue no.',
			arranger: 'Arranger',
			genre: 'Genre',
			difficulty: 'Difficulty',
			notes: 'Note',
			reviewedAt: 'Checked on',
			recording: 'Recording',
			duration: 'Duration',
			publisher: 'Publisher',
			/** The instruments the score is written for, "Flute 1 & 2; Oboe; Violin 1 & 2" (#249). */
			instrumentation: 'Instrumentation',
			/** A medley's songs, one per line: "Habanera – Bizet". */
			contents: 'Contents',
			driveFolderId: 'Drive folder ID'
		}
	},
	concerts: {
		tab: 'Concerts',
		columns: {
			date: 'Date',
			title: 'Occasion',
			location: 'Venue',
			orchestra: 'Orchestra',
			sameProgramAs: 'Same programme as',
			eventId: 'Calendar event ID',
			partners: 'Guest ensembles',
			organizer: 'Organiser'
		}
	},
	program: {
		tab: 'Programme',
		columns: {
			concert: 'Concert',
			position: 'No.',
			piece: 'Piece',
			notes: 'Note',
			/** Which of the concert's orchestras plays it; empty: all of them together. Guests by their short name. */
			orchestra: 'Orchestra',
			composer: 'Composer',
			arranger: 'Arranger',
			publisher: 'Publisher',
			duration: 'Duration'
		}
	},
	ensembles: {
		tab: 'Ensembles',
		columns: {
			shortName: 'Short name',
			name: 'Name',
			kind: 'Type',
			conductor: 'Conductor',
			website: 'Website',
			logo: 'Logo'
		}
	},
	members: {
		tab: 'Members',
		columns: {
			email: 'Email',
			name: 'Name',
			instrument: 'Instrument',
			groups: 'Groups',
			orchestras: 'Orchestras',
			status: 'Status',
			pausedUntil: 'Paused until',
			linkVersion: 'Link version',
			feedVersion: 'Calendar version',
			children: 'Children'
		}
	},
	groups: {
		tab: 'Groups',
		columns: {
			name: 'Group',
			description: 'Description'
		}
	},
	rights: {
		tab: 'Rights',
		columns: {
			who: 'Who',
			right: 'Right'
		}
	},
	requests: {
		tab: 'Access requests',
		columns: {
			email: 'Email',
			name: 'Name',
			requestedAt: 'Requested on'
		}
	},
	reports: {
		tab: 'Reports',
		columns: {
			piece: 'Piece',
			pieceId: 'Drive folder ID',
			part: 'Part',
			fileId: 'File ID',
			kind: 'Kind',
			comment: 'Comment',
			status: 'Status',
			note: 'Note',
			reportedBy: 'Reported by',
			reportedAt: 'Reported on',
			marked: 'In file name',
			driveComment: 'Drive comment ID',
			/** A better recording, with "Wrong recording". */
			link: 'Suggestion',
			/** Scan job: how urgent, who scans (email), what to do. */
			priority: 'Priority',
			assignee: 'Who scans',
			task: 'Scan job',
			id: 'Report ID'
		}
	},
	wishes: {
		tab: 'Wishes',
		columns: {
			kind: 'Kind',
			title: 'Title',
			composer: 'Composer',
			link: 'Link',
			description: 'Description',
			status: 'Status',
			answer: 'Answer',
			submittedBy: 'Submitted by',
			submittedAt: 'Date',
			votes: '+1',
			concert: 'Concert',
			pieceId: 'Piece ID',
			id: 'Wish ID'
		}
	},
	missingParts: {
		tab: 'Missing parts',
		columns: {
			piece: 'Piece',
			part: 'Part',
			status: 'Status',
			fileId: 'File ID',
			done: 'done',
			/** Scan jobs: which gap comes first, and who scans it (e-mail). */
			priority: 'Priority',
			assignee: 'Scanned by'
		}
	},
	instrumentGroups: {
		tab: 'Instrument groups',
		columns: {
			part: 'Part',
			players: 'Played by',
			mutual: 'Mutual',
			note: 'Note'
		}
	},
	signups: {
		tab: 'Sign-ups',
		columns: {
			event: 'Date',
			who: 'Who',
			name: 'Name',
			answer: 'Answer',
			instrument: 'Instrument',
			comment: 'Comment',
			answeredAt: 'Answered on',
			eventId: 'Date ID'
		}
	},
	rehearsals: {
		tab: 'Rehearsals',
		columns: {
			rehearsal: 'Rehearsal',
			piece: 'Piece',
			notes: 'Note',
			eventId: 'Date ID'
		}
	},
	loans: {
		tab: 'Rentals',
		columns: {
			piece: 'Piece',
			from: 'From',
			borrowedAt: 'Borrowed on',
			dueAt: 'Due back',
			returned: 'Returned',
			notes: 'Note'
		}
	},
	attendance: {
		tab: 'Attendance',
		columns: {
			event: 'Date',
			who: 'Who',
			name: 'Name',
			present: 'Present',
			eventId: 'Date ID'
		}
	},
	/** Notes on a piece from rehearsals (#125): cuts, repeats, bowings; one row per note. */
	pieceNotes: {
		tab: 'Piece notes',
		columns: {
			piece: 'Piece',
			/** Empty for everyone, else a section ("Strings") or an instrument ("Violin"). */
			section: 'For',
			/** Empty for every performance, else a concert's "Occasion". */
			concert: 'Concert',
			note: 'Note',
			by: 'By',
			at: 'Date',
			id: 'Note ID'
		}
	},
	/** What a rehearsal did and what comes next (#145); one row per rehearsal. */
	partAssignments: {
		tab: 'Part assignments',
		columns: {
			who: 'Who',
			part: 'Plays',
			piece: 'Piece',
			concert: 'Concert',
			by: 'By',
			at: 'Date',
			id: 'Assignment ID'
		}
	},
	rehearsalNotes: {
		tab: 'Rehearsal notes',
		columns: {
			rehearsal: 'Rehearsal',
			done: 'Rehearsed',
			practise: 'To practise',
			next: 'Next time',
			by: 'By',
			at: 'Date',
			eventId: 'Date ID'
		}
	},
	instruments: {
		tab: 'Instruments',
		columns: {
			name: 'Instrument',
			label: 'Shown as',
			aliases: 'More spellings'
		}
	},
	settings: {
		tab: 'Settings',
		columns: {
			key: 'Setting',
			value: 'Value'
		},
		keys: {
			name: 'Name',
			shortName: 'Short name',
			logo: 'Logo',
			accent: 'Accent colour',
			look: 'Look',
			featuresOff: 'Turned off',
			retention: 'Retention (seasons)',
			links: 'Links'
		},
		lookValues: {
			bold: 'bold',
			plain: 'plain'
		}
	}
};
