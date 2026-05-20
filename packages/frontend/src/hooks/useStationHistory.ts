import { useQuery } from '@tanstack/react-query';
import type { StationDayHistory } from '@thailand-aq/types';
import { useTimeStore } from '../store/timeStore';

const API = import.meta.env.VITE_API_BASE_URL;

export function useStationHistory(stationId: string | null) {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ['station-history', stationId, selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `${API}/api/stations/${stationId!}/history?days=5&date=${selectedDate}`,
      );
      if (!res.ok) throw new Error(`station history fetch failed: ${res.status}`);
      const body = (await res.json()) as { stationId: string; days: StationDayHistory[] };
      return body.days;
    },
    staleTime: Infinity, // historical dates are immutable after ingestion
    enabled: stationId !== null,
  });
}
