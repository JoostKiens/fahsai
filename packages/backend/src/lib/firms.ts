import { DEFAULT_BBOX } from './bbox.js';

export interface FirmsRow {
  detectedAt: string; // ISO 8601 UTC
  lat: number;
  lng: number;
  frp: number | null;
  confidence: string;
  daynight: string;
}

export async function fetchFirms(date: string): Promise<FirmsRow[]> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) throw new Error('FIRMS_MAP_KEY env var is required');

  const url =
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}` +
    `/VIIRS_NOAA21_NRT/${DEFAULT_BBOX}/1/${date}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FIRMS API error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  // FIRMS sometimes returns a plain-text or HTML error body with HTTP 200.
  // Detect this before attempting CSV parse.
  const firstLine = text.split('\n')[0].trim();
  if (!firstLine.toLowerCase().startsWith('latitude')) {
    throw new Error(`FIRMS API returned unexpected response: ${firstLine.slice(0, 200)}`);
  }

  return parseFirmsCsv(text);
}

// Actual VIIRS NOAA-21 NRT area API columns (confirmed from live response):
// latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
// instrument,confidence,version,bright_ti5,frp,daynight
function parseFirmsCsv(csv: string): FirmsRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return []; // header only or empty

  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => headers.indexOf(name);

  const iLat = idx('latitude');
  const iLng = idx('longitude');
  const iFrp = idx('frp');
  const iAcqDate = idx('acq_date');
  const iAcqTime = idx('acq_time');
  const iConfidence = idx('confidence');
  const iDaynight = idx('daynight');

  const rows: FirmsRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');

    const hhmm = (cols[iAcqTime] ?? '0000').padStart(4, '0');
    const detectedAt = `${cols[iAcqDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`;

    rows.push({
      detectedAt,
      lat: parseFloat(cols[iLat]),
      lng: parseFloat(cols[iLng]),
      frp: parseNullableFloat(cols[iFrp]),
      confidence: cols[iConfidence]?.trim() ?? '',
      daynight: cols[iDaynight]?.trim() ?? '',
    });
  }

  return rows;
}

function parseNullableFloat(val: string | undefined): number | null {
  if (val === undefined || val.trim() === '' || val.trim() === 'nan') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}
