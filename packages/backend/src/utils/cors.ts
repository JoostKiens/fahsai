// Vercel preview deployments (fahsai-git-<branch>-… and fahsai-<hash>-…) call the production API
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/fahsai-[a-z0-9-]+-joost-kiens-projects\.vercel\.app$/;

export const ALLOWED_ORIGINS: (string | RegExp)[] =
  process.env.NODE_ENV === 'production'
    ? ['https://fahsai.fyi', VERCEL_PREVIEW_ORIGIN]
    : ['https://fahsai.fyi', VERCEL_PREVIEW_ORIGIN, 'http://localhost:5173'];

export function corsOriginHeader(requestOrigin: string | undefined): string | undefined {
  if (requestOrigin === undefined) return undefined;
  const allowed = ALLOWED_ORIGINS.some((origin) =>
    typeof origin === 'string' ? origin === requestOrigin : origin.test(requestOrigin),
  );
  return allowed ? requestOrigin : undefined;
}
