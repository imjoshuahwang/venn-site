import { llmsTxt } from '../lib/mirrors';
export const GET = async () => new Response(await llmsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
