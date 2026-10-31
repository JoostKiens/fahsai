import { resolveLanguageRedirect } from '@/lib/languageRedirect';

const COOKIE_NAME = 'lang';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// The part of Astro's middleware context this needs, so it can be called with a plain object.
interface Context {
  request: Request;
  url: URL;
  cookies: { get(name: string): { value: string } | undefined };
}

/**
 * The language redirect (see CONTEXT.md) as edge middleware: for a request for the English entry
 * page it either answers with a 302 to the right page, setting the language preference when the
 * language switch asked for one, or lets the page through. If deciding goes wrong it lets the page
 * through: a bug here must not take the home page down. Only the deciding is guarded; an error
 * from the page itself is the page's, and passes through untouched.
 */
export async function languageMiddleware(
  context: Context,
  next: () => Promise<Response>,
): Promise<Response> {
  return redirectFor(context) ?? next();
}

function redirectFor({ request, url, cookies }: Context): Response | null {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;

    const redirect = resolveLanguageRedirect({
      url,
      cookieLang: cookies.get(COOKIE_NAME)?.value,
      acceptLanguage: request.headers.get('Accept-Language'),
    });
    if (!redirect) return null;

    // Decided by the cookie and the browser's language, so it is for this visitor only.
    const headers = new Headers({
      Location: redirect.location,
      'Cache-Control': 'private, no-store',
      Vary: 'Accept-Language, Cookie',
    });
    if (redirect.rememberAs) {
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      headers.set(
        'Set-Cookie',
        `${COOKIE_NAME}=${redirect.rememberAs}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}; HttpOnly`,
      );
    }
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error('[languageMiddleware] failed, serving the page as it is:', error);
    return null;
  }
}
