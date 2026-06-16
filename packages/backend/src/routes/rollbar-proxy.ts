import type { FastifyInstance } from 'fastify';

export function rollbarProxyRoutes(app: FastifyInstance): void {
  app.post('/api/rollbar', async (request, reply) => {
    try {
      // Rollbar SDK sends the token as X-Rollbar-Access-Token header, not in the body
      const bodyToSend =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const token = request.headers['x-rollbar-access-token'];
      const res = await fetch('https://api.rollbar.com/api/1/item/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Rollbar-Access-Token': token as string } : {}),
        },
        body: bodyToSend,
      });
      const json: unknown = await res.json();
      return reply.status(res.status).send(json);
    } catch {
      // Never surface Rollbar relay failures as a 5xx — don't trigger the error handler
      return reply.status(200).send({ err: 0, result: { relay_error: true } });
    }
  });
}
