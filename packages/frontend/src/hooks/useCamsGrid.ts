import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTimeStore } from '@/store/timeStore';
import type { PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';
import { staleTimeForArray, type KeepPreviousOption } from '@/utils/queryHelpers';
import { zipGridColumns } from '@/utils/camsColumns';
import { fetchApiData } from '@/lib/api';

export async function fetchCamsGrid(date: string): Promise<PM25GridPoint[]> {
  const columns = await fetchApiData<PM25GridColumns | null>(
    `/cams?date=${date}`,
    'cams grid',
    null,
  );
  return columns ? zipGridColumns(columns) : [];
}

export function useCamsGrid({ keepPrevious = false }: KeepPreviousOption = {}) {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  return useQuery({
    queryKey: ['cams-grid', selectedDate],
    queryFn: () => fetchCamsGrid(selectedDate),
    staleTime: staleTimeForArray,
    enabled: latestDateResolved,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
}
