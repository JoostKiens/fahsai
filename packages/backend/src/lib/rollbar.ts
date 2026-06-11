import Rollbar from 'rollbar';

const token = process.env.ROLLBAR_TOKEN;
const isProduction = process.env.NODE_ENV === 'production';

const instance =
  token && isProduction
    ? new Rollbar({
        accessToken: token,
        environment: 'production',
        captureUncaught: true,
        captureUnhandledRejections: true,
      })
    : null;

export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  if (!instance) return;
  const subject = err instanceof Error ? err : String(err);
  if (extra) {
    instance.error(subject, extra);
  } else {
    instance.error(subject);
  }
}

export function reportWarning(message: string, extra?: Record<string, unknown>): void {
  if (!instance) return;
  if (extra) {
    instance.warning(message, extra);
  } else {
    instance.warning(message);
  }
}
