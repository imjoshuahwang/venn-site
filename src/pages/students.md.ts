import { getPages } from '../lib/mirrors';
export const GET = async () => new Response((await getPages())[1].md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
