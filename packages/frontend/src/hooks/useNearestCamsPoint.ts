import { useQuery } from '@tanstack/react-query';
import type { PM25GridPoint } from '@thailand-aq/types';

const API = import.meta.env.VITE_API_BASE_URL;

export function useNearestCamsPoint(date: string, lat: number | null, lng: number | null) {
  return useQuery({
    queryKey: ['cams-nearest', date, lat, lng],
    queryFn: async () => {
      const res = await fetch(`${API}/api/cams/nearest?date=${date}&lat=${lat}&lng=${lng}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cams nearest fetch failed: ${res.status}`);
      return ((await res.json()) as { data: PM25GridPoint }).data;
    },
    staleTime: Infinity, // historical CAMS grid data is immutable after ingestion
    enabled: lat !== null && lng !== null,
  });
}
