/** Photos and videos of members (#299): the answer on /eltern and /profil, the overview for the Leitung. */
export const photos = {
	title: 'Photos and videos',
	leadChild: (name: string) =>
		`May ${name} appear in the orchestra’s photos and videos, for example on the website, in the programme or on social media? No answer counts as no.`,
	leadSelf: 'May you appear in the orchestra’s photos and videos, for example on the website, in the programme or on social media? No answer counts as no.',
	state: { yes: 'Allowed.', no: 'Not allowed.', open: 'Not answered yet, which counts as no.' } as Record<string, string>,
	allow: 'Allow',
	refuse: 'Don’t allow',
	saved: 'Saved.',
	failed: "That didn't work. Please reload the page and try again.",
	byParents: 'Your parents answer this in the parents’ area.',
	export: 'Photos and videos',
	date: {
		over: 'Photos and videos',
		allAllowed: 'Everyone may appear in photos and videos.',
		notAllowed: (n: number) => (n === 1 ? 'don’t show 1 person' : `don’t show ${n} people`),
	},
	overview: {
		title: 'Photo consent',
		lead: 'Who may appear in the orchestra’s photos and videos. Young members with a parent account answer through their parents, everyone else in their profile.',
		answers: { no: 'Not allowed', open: 'Not answered', yes: 'Allowed' } as Record<string, string>,
		byParent: 'by the parents',
		count: (n: number) => (n === 1 ? '1 person' : `${n} people`),
		empty: 'Nobody.',
		copy: 'Copy names',
		copied: 'Copied.'
	}
} as const;
