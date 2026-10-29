import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import { staleTimeForArray } from '@/utils/queryHelpers';
import { fetchApiData } from '@/lib/api';

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

export function fetchStationReadings(date: string): Promise<LatestMeasurement[]> {
  return fetchApiData<LatestMeasurement[]>(`/station-readings/latest?date=${date}`, 'aqi', []);
}

export function useStationReadings() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['aqi-latest', 'pm25', selectedDate],
    queryFn: () => fetchStationReadings(selectedDate),
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
  });
}
