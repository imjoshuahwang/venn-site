/**
 * /portal/demo shows fake portal states for design review. It exists only in local dev and on Vercel preview
 * deployments. Production (VERCEL_ENV=production), and any build where the variable is missing, gets a 404.
 */
export function demoAllowed(env: { dev?: boolean; vercelEnv?: string | undefined }): boolean {
  return env.dev === true || env.vercelEnv === 'preview';
}
