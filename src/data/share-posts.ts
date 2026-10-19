// Share copy data for /refer. Placeholders: {blank} {link}. Every LinkedIn post keeps the exact
// sentence "I'm building {blank}." (blank-swap code edits that line) and has one @Venn tag spot.
// Claims only from venn-facts.md. No em dashes, no exclamation points, no emoji.

// PLACEHOLDER: Josh to confirm exact page name/URL (venn-site issue)
export const VENN_LINKEDIN = { name: 'Venn: the student org connector', url: 'https://www.linkedin.com/company/venn' };

export const LINKEDIN_POSTS: string[] = [
  "I just applied to @Venn F26, a season for high schoolers who are already building things.\n\nI'm building {blank}.\n\nBuilding something too? Apply with my link: {link}",
  "Venn picks a small batch of high schoolers building clubs, projects, nonprofits and startups. I just applied to @Venn for the fall season.\n\nI'm building {blank}.\n\nIf you're building something, apply here: {link}",
  "Putting this out there: I'm building {blank}.\n\nI applied to @Venn F26 to build it alongside other high schoolers doing the same.\n\nKnow someone who belongs in the batch? Send them this: {link}",
  "@Venn has worked with 141 student organizations that reached 500K+ students. I just applied for its F26 batch.\n\nI'm building {blank}.\n\nApply here: {link}",
  "New step for my project: I applied to @Venn F26.\n\nI'm building {blank}.\n\nHigh schoolers building something can apply here: {link}",
  "Quick question for the high schoolers I know. Are you building something right now?\n\nI'm building {blank}.\n\nI applied to @Venn F26 and you can too: {link}",
  "I applied to @Venn F26.\n\nI'm building {blank}.\n\n{link}",
  "Small update. I'm applying to a program for high schoolers who build things.\n\nI'm building {blank}.\n\nIt's @Venn, and the fall season is F26. Link: {link}",
  "Building in public, day one.\n\nI'm building {blank}.\n\nI just applied to @Venn F26 because I'd rather build next to other high schoolers than alone. If that sounds like you: {link}",
  "My friend group keeps saying we should apply to things. So I did.\n\n@Venn F26 is for high schoolers building clubs, projects, nonprofits and startups. I'm building {blank}.\n\nYour turn: {link}",
  "Honest post. I don't know if I'll get picked. I applied to @Venn F26 anyway.\n\nI'm building {blank}.\n\nVenn picks a small batch each season, so apply if you're building too: {link}",
  "Venn runs four seasons a year, like YC. I applied to the fall one, @Venn F26.\n\nI'm building {blank}.\n\nIf you're a high schooler building something, here's my link: {link}",
  "Most of my project so far has been me, a laptop and a lot of late nights.\n\nI'm building {blank}.\n\nI applied to @Venn F26 to meet other high schoolers doing the same. Here's where: {link}",
  "If you have a project you keep meaning to start, this is your nudge.\n\n@Venn F26 is open to high schoolers building clubs, projects, nonprofits and startups. I'm building {blank}.\n\n{link}",
  "Tagging myself in as a builder. I'm building {blank}.\n\nApplied to @Venn F26 today. Link if you want it: {link}",
  "@Venn says it has worked with Microsoft and Y Combinator. It also says a small batch gets picked each season, which is why I'm posting this.\n\nI'm building {blank}.\n\nApply with me: {link}",
  "To the person in my grade who is quietly building something: apply to @Venn F26.\n\nI'm building {blank}.\n\nI'd like to see what you're making too.\n\n{link}",
  "Sent in my @Venn F26 application today.\n\nI'm building {blank}.\n\nVenn has worked with 141 student organizations, and they reached students in 21 countries. I'd like to see what the next batch builds. Link: {link}",
  "Not sure what to post here, so plain version. I'm building {blank}. I applied to @Venn F26. If you build things, you can apply too: {link}",
  "Update on my project: it now has an application attached to it.\n\nI'm building {blank}.\n\n@Venn F26 is for high schoolers who are already making things. My link: {link}",
  "Two things I believe. Building is easier with other builders around. And deadlines make me finish things.\n\nI'm building {blank}.\n\nI applied to @Venn F26. Apply here: {link}",
  "Friend, if you're reading this, you know who you are. Apply to @Venn F26 with me.\n\nI'm building {blank}. You've been talking about your idea since last year.\n\n{link}",
  "Venn has reached 500,320 students through 141 student organizations. I'm one of the high schoolers applying to @Venn F26.\n\nI'm building {blank}.\n\nMy link is below if you want to join the batch: {link}",
  "Plot twist: nobody checked how big my project is before I hit apply.\n\nI'm building {blank}. @Venn F26 is for high schoolers who build, so I sent mine in.\n\nWant to send yours? {link}",
  "A year ago I had an idea and no plan. Now I have a project and an application in.\n\nI'm building {blank}.\n\nThe program is @Venn F26, a season for high schoolers who build. Link: {link}",
  "Reminder that a batch is small. I applied to @Venn F26.\n\nI'm building {blank}.\n\nIf you want in, use my link: {link}",
  "I'm a high schooler, I'm busy, and I still found time to apply to @Venn F26.\n\nI'm building {blank}.\n\nYou can find the time too, probably: {link}",
  "Building a club, a project, a nonprofit or a startup in high school? @Venn F26 is for you. I applied.\n\nI'm building {blank}.\n\nApply here: {link}",
];

// First line of every LinkedIn post, so a feed full of Venn posts doesn't open the same way twice.
// Calm, first person, no claims at all. Picked per student by openerIndex (share-copy.ts), separate from the body.
export const OPENERS: string[] = [
  "Sharing a small step I took this week.",
  "A quick update from my side.",
  "Something I did today that I want to share.",
  "Posting this so I actually follow through.",
  "I've been heads down on a project lately, so here's an update.",
  "I don't post here much, but here goes.",
  "Writing this down in public so it counts.",
  "A short one today.",
  "Trying something new and saying it out loud.",
  "Here's what I've been up to.",
  "Putting this here for anyone else building something.",
  "One thing from this week worth sharing.",
];

export const SMS_TEXTS: string[] = [
  "hey, i applied to Venn F26, it's for high schoolers building stuff. you should apply too: {link}",
  "you're building that project anyway. Venn F26 is for exactly that, here's my link: {link}",
  "just applied to Venn for the fall season. want to apply with me? {link}",
  "thought of you. Venn picks a small batch of high schoolers who build things, applications are open: {link}",
  "okay don't laugh but i applied to Venn F26. you should too, takes a few minutes: {link}",
];
