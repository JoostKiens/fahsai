import { useQuery } from '@tanstack/react-query';
import type { BaselineResponse } from '@thailand-aq/types';
import { apiUrl } from '@/lib/api';

export function useStationBaseline(stationId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['station-baseline', stationId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/stations/${stationId!}/baseline`));
      if (!res.ok) throw new Error(`baseline fetch failed: ${res.status}`);
      const body = (await res.json()) as BaselineResponse;
      return body;
    },
    staleTime: Infinity,
    enabled: stationId !== null && enabled,
  });
}
