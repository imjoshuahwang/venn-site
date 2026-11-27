// Copy and shape for the parent consent page (#284). Minors' data (#239): only the child's first name and cohort name ever reach it.
export type ParentState = 'ok' | 'used' | 'expired' | 'unknown';
export type ParentCtx = { first_name: string; cohort_name: string };
export type ParentView = { kind: 'sign' | 'signed' | 'expired'; title: string; intro?: string; about?: string; agree: string[]; body?: string; button?: string; mail?: string };

export const CONTACT_MAIL = 'mailto:contact@joinvenn.org';

export function parseParentState(data: unknown): { state: ParentState; ctx: ParentCtx | null } {
  const o = typeof data === 'string' ? { state: data } : ((data ?? {}) as Record<string, unknown>);
  const state = (['ok', 'used', 'expired'] as const).find((s) => s === o.state) ?? 'unknown';
  const first = typeof o.first_name === 'string' ? o.first_name.trim() : '';
  const cohort = typeof o.cohort_name === 'string' ? o.cohort_name.trim() : '';
  return { state, ctx: first && cohort ? { first_name: first, cohort_name: cohort } : null };
}

export function parentView(state: ParentState, ctx: ParentCtx | null): ParentView {
  if (state === 'ok') {
    return {
      kind: 'sign',
      title: `${ctx ? ctx.first_name : 'Your child'} would like to join Venn`,
      intro: ctx
        ? `${ctx.first_name} applied to ${ctx.cohort_name}. Because ${ctx.first_name} is under 18, we need a parent or guardian to say yes too.`
        : 'Your child applied to Venn. Because they are under 18, we need a parent or guardian to say yes too.',
      about: 'Venn is a network for ambitious high school students who are building clubs, projects, nonprofits and startups, and it connects them with each other, college students and companies that can help.',
      agree: [
        `${ctx ? ctx.first_name : 'Your child'} can take part in the cohort, and everything runs through Venn-run groups and contact@joinvenn.org.`,
        'Venn uses their answers to match them and to contact them about Venn. We share them with the cohort partner only for the cohort, and never sell them.',
        'Venn keeps their information until you or they ask us to delete it, and you can ask at any time at contact@joinvenn.org.',
        'The company in the cohort is aligned with it, not paying or sponsoring anyone.',
      ],
      button: 'I agree',
    };
  }
  if (state === 'used') {
    return {
      kind: 'signed',
      title: 'Thank you, you are all set',
      body: `${ctx ? ctx.first_name : 'Your child'} will be told that you said yes. There is nothing else you need to do.`,
      agree: [],
    };
  }
  return {
    kind: 'expired',
    title: 'This link has expired',
    body: 'Consent links stop working after a few days, or once a newer one has been sent. Your child can ask for a new link from their Venn portal, or you can write to us and we will help.',
    agree: [],
    mail: CONTACT_MAIL,
  };
}
