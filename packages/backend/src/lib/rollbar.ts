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
        exitOnUncaughtException: true,
      })
    : null;

export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  if (!instance) return;
  if (err instanceof Error) {
    instance.error(err, extra);
  } else {
    instance.error('Non-Error thrown', { error: err, ...extra });
  }
}

export function reportWarning(message: string, extra?: Record<string, unknown>): void {
  if (!instance) return;
  instance.warning(message, extra);
}

export function waitForRollbar(): Promise<void> {
  if (!instance) return Promise.resolve();
  return new Promise((resolve) => instance.wait(resolve));
}
