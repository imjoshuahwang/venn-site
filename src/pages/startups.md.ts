import { getPages } from '../lib/mirrors';
export const GET = async () => new Response((await getPages())[2].md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
