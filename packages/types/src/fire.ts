export interface FirePoint {
  id: number;
  detectedAt: string; // ISO 8601
  lat: number;
  lng: number;
  frp: number | null; // fire radiative power MW
  confidence: string | null; // 'low' | 'nominal' | 'high'
  daynight: string | null; // 'D' | 'N'
}
