// Next steps for the non-cohort outcomes (#323). Plain, honest, no promises Venn cannot keep.
type Step = { title: string; lead: string; points: string[] };
export const OTHER_STEPS: Record<string, { slides: Step[]; last: { title: string; lead: string } }> = {
  peer: {
    slides: [{ title: 'Meet your match.', lead: 'The fastest way to make this season count is a first conversation.', points: ['Say yes on your result page if you have not yet.', 'Once you both accept, your intro unlocks right in the portal.', 'Plan one small thing to build or try together this month.'] }],
    last: { title: 'That is all you need.', lead: 'Come back whenever you like, your match will be here.' },
  },
  network_waitlist: {
    slides: [{ title: 'Keep building.', lead: 'Waitlisted Applicants hear about new Programs first, so keep your work moving in the meantime.', points: ['Ship one small thing and keep the link handy.', 'Tell a club or friend who should apply too.', 'Watch your inbox, we write when a Program opens.'] }],
    last: { title: 'We will be in touch.', lead: 'Nothing else is needed from you right now.' },
  },
  track_waitlist: {
    slides: [{ title: 'Stay ready.', lead: 'If a Cohort seat goes unclaimed after 5 days, runners-up get the first look.', points: ['Keep an eye on your email this week.', 'Reply quickly when we write, seats move fast.', 'Keep working on your project so you can start right away.'] }],
    last: { title: 'We will write the moment one opens.', lead: 'Nothing else is needed from you right now.' },
  },
  not_this_season: {
    slides: [{ title: 'Make the next application stronger.', lead: 'A few things tend to move an application from maybe to yes.', points: ['Show something you built or ran, with a link we can open.', 'Tell us what you learned and what you would do next.', 'Say who you would bring along.'] }],
    last: { title: 'We would love to see you again.', lead: 'Opt in on your result page and we will consider you for the next season.' },
  },
};
