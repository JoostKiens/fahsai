import { useQuery } from '@tanstack/react-query';
import { useTimeStore } from '../store/timeStore';
import type { PM25GridPoint } from '@thailand-aq/types';
import { staleTimeForArray } from '../utils/queryHelpers';

const API = import.meta.env.VITE_API_BASE_URL;

export function useCamsGrid() {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  return useQuery({
    queryKey: ['cams-grid', selectedDate],
    queryFn: async () => {
      const res = await fetch(`${API}/api/cams?date=${selectedDate}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`cams grid fetch failed: ${res.status}`);
      return ((await res.json()) as { data: PM25GridPoint[] }).data;
    },
    staleTime: staleTimeForArray,
  });
}
