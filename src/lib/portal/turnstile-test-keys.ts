// Cloudflare's documented TEST keys. Dev only: production code loads this behind import.meta.env.DEV so it never ships.
export const TURNSTILE_TEST = {
  siteKey: '1x00000000000000000000AA',
  secretPass: '1x0000000000000000000000000000000AA',
  secretFail: '2x0000000000000000000000000000000AA',
};
