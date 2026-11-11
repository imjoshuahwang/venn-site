import { getGuides, guideMirror } from '../../lib/mirrors';

export async function getStaticPaths() {
  return (await getGuides()).map((g) => ({ params: { slug: g.id }, props: { g } }));
}

export const GET = ({ props }: { props: { g: Awaited<ReturnType<typeof getGuides>>[number] } }) =>
  new Response(guideMirror(props.g).md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
