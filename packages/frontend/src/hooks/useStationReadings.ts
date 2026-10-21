import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { apiUrl, isNoData } from '@/lib/api';

export interface LatestMeasurement {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
  value: number;
  measuredAt: string;
}

export function useStationReadings() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['aqi-latest', 'pm25', selectedDate],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/station-readings/latest?date=${selectedDate}`));
      if (await isNoData(res)) return [];
      if (!res.ok) throw new Error(`aqi fetch failed: ${res.status}`);
      return ((await res.json()) as { data: LatestMeasurement[] }).data;
    },
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
