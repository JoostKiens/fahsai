import { useQuery } from '@tanstack/react-query';
import type { BaselineDay } from '@thailand-aq/types';

const API = import.meta.env.VITE_API_BASE_URL;

export function useStationBaseline(stationId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['station-baseline', stationId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/stations/${stationId!}/baseline`);
      if (!res.ok) throw new Error(`baseline fetch failed: ${res.status}`);
      const body = (await res.json()) as {
        data: BaselineDay[];
        minYear: number | null;
        maxYear: number | null;
      };
      return body;
    },
    staleTime: Infinity,
    enabled: stationId !== null && enabled,
  });
}
