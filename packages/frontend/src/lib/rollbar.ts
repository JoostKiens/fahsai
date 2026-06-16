import type Rollbar from 'rollbar';

const token = import.meta.env.VITE_ROLLBAR_TOKEN as string | undefined;
const isProduction = import.meta.env.MODE === 'production';
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

let rollbar: Rollbar | null = null;

// ponytail: dynamic import so Vite never pre-bundles rollbar.js in dev (ad blockers block that URL)
if (token && isProduction) {
  void import('rollbar')
    .then(({ default: RollbarClass }) => {
      rollbar = new RollbarClass({
        accessToken: token,
        environment: 'production',
        captureUncaught: true,
        captureUnhandledRejections: true,
        autoInstrument: { network: false, dom: false },
        endpoint: `${apiBase}/api/rollbar`,
      });
    })
    .catch(() => {
      // blocked or failed — app continues without error reporting
    });
}

export { rollbar };
