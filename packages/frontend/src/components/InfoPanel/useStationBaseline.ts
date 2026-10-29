import { useQuery } from '@tanstack/react-query';
import type { BaselineResponse } from '@thailand-aq/types';
import { fetchJson } from '@/lib/api';

export function useStationBaseline(stationId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['station-baseline', stationId],
    queryFn: () => fetchJson<BaselineResponse>(`/stations/${stationId!}/baseline`, 'baseline'),
    staleTime: Infinity,
    enabled: stationId !== null && enabled,
  });
}
