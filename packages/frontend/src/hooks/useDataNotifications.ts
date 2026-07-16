import { useEffect, useRef, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useFires } from './useFires';
import { useStationReadings } from './useStationReadings';
import { useWind } from './useWind';
import { useCamsGrid } from './useCamsGrid';
import { useTimeStore, selectIsSettled } from '@/store/timeStore';

type ToastId = string | number;

function showGapToastOnce(
  idRef: MutableRefObject<ToastId | null>,
  isSettled: boolean,
  isSuccess: boolean,
  isEmpty: boolean,
  message: string,
): void {
  if (!isSettled || !isSuccess || idRef.current !== null) return;
  if (isEmpty) idRef.current = toast(message, { duration: Infinity });
}

export function useDataNotifications() {
  const { t } = useTranslation();
  const isSettled = useTimeStore(selectIsSettled);
  const fires = useFires();
  const aqi = useStationReadings();
  const wind = useWind();
  const cams = useCamsGrid();

  const firesId = useRef<ToastId | null>(null);
  const stationId = useRef<ToastId | null>(null);
  const windId = useRef<ToastId | null>(null);
  const camsId = useRef<ToastId | null>(null);

  const selectedDate = useTimeStore((s) => s.selectedDate);

  // Dismiss all active gap toasts when the date changes
  useEffect(() => {
    for (const idRef of [firesId, stationId, windId, camsId]) {
      if (idRef.current !== null) {
        toast.dismiss(idRef.current);
        idRef.current = null;
      }
    }
  }, [selectedDate]);

  const firesEmpty = fires.data?.length === 0;
  useEffect(
    () => showGapToastOnce(firesId, isSettled, fires.isSuccess, firesEmpty, t('toast.noFires')),
    [isSettled, fires.isSuccess, firesEmpty, t],
  );

  const aqiEmpty = aqi.data?.length === 0;
  useEffect(
    () =>
      showGapToastOnce(stationId, isSettled, aqi.isSuccess, aqiEmpty, t('toast.noStationReadings')),
    [isSettled, aqi.isSuccess, aqiEmpty, t],
  );

  const windEmpty = wind.data?.length === 0;
  useEffect(
    () => showGapToastOnce(windId, isSettled, wind.isSuccess, windEmpty, t('toast.noWind')),
    [isSettled, wind.isSuccess, windEmpty, t],
  );

  const camsEmpty = cams.data?.length === 0;
  useEffect(
    () => showGapToastOnce(camsId, isSettled, cams.isSuccess, camsEmpty, t('toast.noCams')),
    [isSettled, cams.isSuccess, camsEmpty, t],
  );
}
