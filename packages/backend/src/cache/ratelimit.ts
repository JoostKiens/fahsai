import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './client.js';

export const explainRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'ratelimit:explain',
});

export const explainContextRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'ratelimit:explain-context',
});
