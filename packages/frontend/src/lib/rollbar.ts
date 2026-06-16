import Rollbar from 'rollbar';

const token = import.meta.env.VITE_ROLLBAR_TOKEN as string | undefined;
const isProduction = import.meta.env.MODE === 'production';
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

let rollbar: Rollbar | null = null;

if (token && isProduction) {
  try {
    rollbar = new Rollbar({
      accessToken: token,
      environment: 'production',
      captureUncaught: true,
      captureUnhandledRejections: true,
      autoInstrument: { network: false, dom: false },
      endpoint: `${apiBase}/api/rollbar`,
    });
  } catch {
    // Rollbar constructor failed — app continues without error reporting
  }
}

export { rollbar };
