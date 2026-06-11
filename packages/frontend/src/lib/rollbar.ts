import Rollbar from 'rollbar';

const token = import.meta.env.VITE_ROLLBAR_TOKEN as string | undefined;

export const rollbar = token
  ? new Rollbar({
      accessToken: token,
      environment: 'production',
      captureUncaught: true,
      captureUnhandledRejections: true,
    })
  : null;
