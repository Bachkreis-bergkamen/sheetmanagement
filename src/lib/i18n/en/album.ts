/** Photos and impressions (#66): the album, one album's page, adding photos, approving them. */
export const album = {
	title: 'Photos & impressions',
	lead: 'Photos and memories of concerts, rehearsals and trips, back to the founding. New photos appear once they are approved.',
	notSetUp: 'The photo album isn’t set up yet: it needs the database (D1) and storage for images (R2).',
	membersOnly: 'Only signed-in members see photos.',
	/** Per album, singular. */
	kind: { konzert: 'Concert', probe: 'Rehearsal', fahrt: 'Trip', sonstiges: 'Album' } as Record<string, string>,
	/** The filter, plural. */
	kinds: { konzert: 'Concerts', probe: 'Rehearsals', fahrt: 'Trips', sonstiges: 'Other' } as Record<string, string>,
	all: 'All',
	allYears: 'All years',
	filterKind: 'Kind',
	filterYear: 'Year',
	decades: 'Decades',
	years: 'Years',
	empty: 'No photos yet. Add the first ones!',
	emptyFiltered: 'No photos for this selection.',
	photos: (n: number) => (n === 1 ? '1 photo' : `${n} photos`),
	comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
	add: 'Add photos',
	videos: (n: number) => (n === 1 ? '1 recording' : `${n} recordings`),
	waiting: (n: number) => (n === 1 ? '1 item waiting for approval' : `${n} items waiting for approval`),

	/** /fotos/neu: what the photos belong to. */
	pick: {
		title: 'Add photos',
		lead: 'What do the photos belong to? A concert from the archive, a rehearsal, a trip, or an album of its own for anything else.',
		search: 'Search: title or year',
		none: 'Nothing found.',
		more: (n: number) => `${n} more: search by title or year to find them.`,
		ownTitle: 'Create an album of its own',
		ownLead: 'For anything that’s neither in the calendar nor in the archive: a summer party, an outing, old photos from the early days.',
		name: 'Title',
		nameHint: 'Summer party in the vicarage garden',
		year: 'Year',
		month: 'Month',
		day: 'Day',
		optional: 'optional',
		noMonth: '–',
		create: 'Create album',
		badName: (max: number) => `Please give the album a title of at most ${max} characters.`,
		badDate: (first: number) => `Please give a date between ${first} and today; the day only together with the month.`
	},

	/** One album: /fotos/termin/<id>, /fotos/fahrt/<id>, /fotos/album/<id>. */
	page: {
		toEvent: 'To the date',
		toTrip: 'To the trip',
		toAlbum: 'All photos',
		noPhotos: 'No photos in this album yet.',
		pending: 'Waiting for approval',
		public: 'On the website',
		by: (name: string) => `By ${name}`,
		open: (n: number, of: number) => `Enlarge photo ${n} of ${of}`,
		close: 'Close',
		previous: 'Previous photo',
		next: 'Next photo',
		remove: 'Remove photo',
		removeConfirm: 'Really remove this photo? This can’t be undone.',
		removed: 'Photo removed.',
		download: 'Open original'
	},

	upload: {
		title: 'Upload photos',
		lead: 'Please only photos of people who agree to it. The photos are made smaller on your device, and location data is removed.',
		leadPending: 'They appear once they are approved.',
		choose: 'Choose photos',
		caption: 'Caption',
		captionHint: 'for all chosen photos, optional',
		preparing: 'Preparing photos …',
		ready: (n: number) => (n === 1 ? '1 photo ready' : `${n} photos ready`),
		send: (n: number) => (n === 1 ? 'Upload 1 photo' : `Upload ${n} photos`),
		clear: 'Clear selection',
		unreadable: (name: string) => `“${name}” couldn’t be opened and is skipped.`,
		sent: (n: number) => (n === 1 ? 'Photo uploaded. It appears once approved.' : `${n} photos uploaded. They appear once approved.`),
		sentApproved: (n: number) => (n === 1 ? 'Photo uploaded.' : `${n} photos uploaded.`),
		notOpen: 'Photos can be added once the date has begun.'
	},

	/** Recordings (#408): unlisted YouTube videos. */
	video: {
		title: 'Recordings',
		lead: 'Recordings and films as “unlisted” YouTube videos: only those with the link can play them, and here only signed-in members see it. Never on the website.',
		none: 'No recordings yet.',
		add: 'Add a recording',
		link: 'YouTube link',
		linkHint: 'Upload to YouTube as “Unlisted” (not “Private”: that can’t be played here), then paste the link here.',
		name: 'Title',
		nameHint: 'Recording of the whole concert',
		pieces: 'Which pieces are in it?',
		piecesHint: 'Where does each start, e.g. 12:30? Leave empty what isn’t in it; 0:00 for the beginning.',
		suggest: 'Suggest recording',
		save: 'Add recording',
		sent: 'Recording suggested. It appears once approved.',
		sentApproved: 'Recording added.',
		by: (name: string) => `By ${name}`,
		remove: 'Remove recording',
		removeConfirm: 'Remove this recording from the album? The video on YouTube stays.',
		removed: 'Recording removed.'
	},

	talk: {
		title: 'Impressions',
		label: 'Your comment',
		hint: 'How was it? What will you remember?',
		post: 'Comment',
		none: 'No comments yet.',
		remove: 'Delete comment',
		removeConfirm: 'Really delete this comment?'
	},

	/** /fotos/freigabe, for those with "fotos.freigeben". */
	approval: {
		title: 'Approve photos',
		lead: 'What members uploaded. Approved photos are seen by all members. A photo goes on the website only if you approve it for that.',
		empty: 'Nothing is waiting for approval.',
		approve: 'Approve',
		approvePublic: 'Also for the website',
		reject: 'Reject',
		rejectConfirm: 'Reject this photo? It will be deleted.',
		approved: 'Approved.',
		rejected: 'Rejected and deleted.',
		notShown: (names: string) => `Without photo consent: ${names}. Photos showing them must not go on the website.`,
		consentHint: 'Before the website: has everyone who can be seen agreed? Who agreed is listed under photo consent.',
		videos: 'Recordings',
		storage: (used: string, budget: string) => `Photo storage: ${used} of ${budget} used`,
		storageHint: 'Cloudflare R2 is free up to 10 GB. The album takes photos only up to this limit, so it never costs money.',
		makePublic: 'Put on the website',
		makePrivate: 'Take off the website',
		uploaded: (name: string, when: string) => `${name}, ${when}`
	},

	problems: {
		noFiles: 'Please choose at least one photo.',
		tooMany: (max: number) => `At most ${max} photos at a time.`,
		badFile: 'A file isn’t a photo (JPEG, PNG or WebP) or is too large.',
		caption: (max: number) => `The caption is too long, at most ${max} characters.`,
		comment: (max: number) => `Please write a comment of at most ${max} characters.`,
		notOpen: 'Photos can’t be added to this date yet.',
		gone: 'That doesn’t exist any more.',
		badLink: 'That isn’t a YouTube link.',
		videoTitle: (max: number) => `Please give the recording a title of at most ${max} characters.`,
		badStart: (piece: string) => `I can’t read the start time for “${piece}”; please write e.g. 12:30.`,
		full: (budget: string) => `Photo storage is full (${budget}), so the album stays free. The organisers can delete old photos.`,
		daily: (n: number) => `You’ve already added ${n} photos today; more tomorrow.`,
		waiting: (n: number) => `${n} of your photos are already waiting for approval. Once they’re approved you can add more.`,
		notYours: 'You may not remove that.',
		failed: 'That didn’t work. Please try again.'
	},

	/** In "Download my data". */
	exported: {
		photos: 'Uploaded photos',
		comments: 'Comments in the photo album',
		videos: 'Suggested recordings',
		link: 'Link',
		album: 'Album',
		caption: 'Caption',
		status: 'Status',
		uploaded: 'Uploaded',
		text: 'Text',
		written: 'Written',
		statuses: { pending: 'waiting for approval', approved: 'approved' } as Record<string, string>
	},
	/** In "Delete member". */
	erased: 'Photos, recordings and comments in the photo album (photos and recordings stay without a name, comments are deleted)'
} as const;
