import { useQuery } from '@tanstack/react-query';
import type { ClimatologyDay } from '@thailand-aq/types';

const API = import.meta.env.VITE_API_BASE_URL;

export function useStationClimatology(stationId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['station-climatology', stationId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/stations/${stationId!}/climatology`);
      if (!res.ok) throw new Error(`climatology fetch failed: ${res.status}`);
      const body = (await res.json()) as { data: ClimatologyDay[] };
      return body.data;
    },
    staleTime: Infinity,
    enabled: stationId !== null && enabled,
  });
}
