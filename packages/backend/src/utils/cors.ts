export const ALLOWED_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? ['https://fahsai.fyi']
    : ['https://fahsai.fyi', 'http://localhost:5173'];

export function corsOriginHeader(requestOrigin: string | undefined): string | undefined {
  if (requestOrigin === undefined || !ALLOWED_ORIGINS.includes(requestOrigin)) return undefined;
  return requestOrigin;
}
