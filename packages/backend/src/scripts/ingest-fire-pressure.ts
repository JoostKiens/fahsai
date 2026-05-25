import 'dotenv/config';
import { ingestFirePressure } from '../jobs/ingest-fire-pressure.js';

const targetDate = process.argv[2]; // optional YYYY-MM-DD override

try {
  const result = await ingestFirePressure(targetDate);
  console.log('[ingest-fire-pressure] done', result);
  process.exit(0);
} catch (err) {
  console.error('[ingest-fire-pressure] failed', err);
  process.exit(1);
}
