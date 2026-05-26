import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '../store/timeStore';

const API = import.meta.env.VITE_API_BASE_URL;

export interface LatestMeasurement {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  country: string | null;
  value: number;
  measuredAt: string;
}

export function useStationReadings() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ['aqi-latest', 'pm25', selectedDate],
    queryFn: async () => {
      const res = await fetch(`${API}/api/station-readings/latest?date=${selectedDate}`);
      if (!res.ok) throw new Error(`aqi fetch failed: ${res.status}`);
      return ((await res.json()) as { data: LatestMeasurement[] }).data;
    },
    staleTime: Infinity, // historical dates are immutable after ingestion
  });
}
