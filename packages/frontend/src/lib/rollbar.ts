import type Rollbar from 'rollbar';

const token = import.meta.env.VITE_ROLLBAR_TOKEN as string | undefined;
const isProduction = import.meta.env.MODE === 'production';
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

let rollbar: Rollbar | null = null;

if (token && isProduction) {
  try {
    const { default: RollbarClass } = await import('rollbar');
    rollbar = new RollbarClass({
      accessToken: token,
      environment: 'production',
      captureUncaught: true,
      captureUnhandledRejections: true,
      autoInstrument: { network: false, dom: false },
      endpoint: `${apiBase}/api/rollbar`,
    });
  } catch {
    // Blocked by ad-blocker — fail silently, app continues without error reporting
  }
}

export { rollbar };
