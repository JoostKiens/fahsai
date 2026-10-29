import { useQuery } from '@tanstack/react-query';
import type { StationDayHistory } from '@thailand-aq/types';
import { useTimeStore } from '@/store/timeStore';
import { fetchJson } from '@/lib/api';

export function useStationHistory(stationId: string | null) {
  const selectedDate = useTimeStore((s) => s.selectedDate);
  // Fetch one extra day ahead so canGoNext can use the same historyDateSet check as canGoPrev.
  // The chart filters to days ≤ selectedDate; the +1 row is only used for availability.
  // Uses UTC throughout (parse + setUTCDate) so the +1 day is not affected by the browser's
  // local timezone.
  const nextDay = (() => {
    const d = new Date(`${selectedDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const query = useQuery({
    queryKey: ['station-history', stationId, selectedDate],
    queryFn: async () => {
      const body = await fetchJson<{ stationId: string; days: StationDayHistory[] }>(
        `/stations/${stationId!}/history?days=6&date=${nextDay}`,
        'station history',
      );
      return body.days;
    },
    staleTime: Infinity, // historical dates are immutable after ingestion
    // Keep previous data only when navigating dates on the same station so the
    // chart stays visible during the refetch. Clear immediately on station switch
    // so the shimmer shows instead of the wrong station's bars.
    placeholderData: (
      prev: StationDayHistory[] | undefined,
      prevQuery: { queryKey: unknown[] } | undefined,
    ) => (prevQuery?.queryKey[1] === stationId ? prev : undefined),
    enabled: stationId !== null,
  });
  return { data: query.data, isPending: query.isPending, isFetching: query.isFetching };
}
