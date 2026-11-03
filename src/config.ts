/**
 * n8n webhook (production URL) that receives punches, day notes and locations.
 * Set at build time with VITE_SYNC_URL (see .github/workflows/deploy.yml).
 * Empty = nothing is sent; the app then works on the device only.
 */
export const SYNC_URL: string = import.meta.env.VITE_SYNC_URL ?? '';

/** Header the company key is sent in; must match the Header Auth credential in n8n. */
export const SYNC_AUTH_HEADER = 'X-Stempel-Key';
