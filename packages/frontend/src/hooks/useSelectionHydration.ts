import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';
import { useStationReadings } from './useStationReadings';
import { useFires } from './useFires';
import { usePowerPlants } from './usePowerPlants';

/**
 * Resolves the boot-time `?sel=` URL param into a full `SelectedPoint` once the
 * relevant TanStack Query data is available.
 *
 * Runs once per `pendingSelection`. Any explicit user action that calls
 * `setSelectedPoint` (click, ESC, dismiss) clears `pendingSelection` and
 * cancels hydration so the user's choice always wins a race with the network.
 */
export function useSelectionHydration() {
  const { t } = useTranslation();
  const pendingSelection = useUIStore((s) => s.pendingSelection);
  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const setSelectedPoint = useUIStore((s) => s.setSelectedPoint);
  const setPendingSelection = useUIStore((s) => s.setPendingSelection);

  // Subscribe to the three sources unconditionally so we get cache hits when a
  // peer component (MapView, InfoPanel) already mounted the same query. Power
  // plants are gated by `enabled`, so force-enable only while we need them.
  const { data: stations } = useStationReadings();
  const { data: fires } = useFires();
  const { data: plants } = usePowerPlants(pendingSelection?.kind === 'plant');

  useEffect(() => {
    if (!pendingSelection) return;
    // A manual selection happened before data arrived — drop the URL target.
    if (selectedPoint) {
      setPendingSelection(null);
      return;
    }

    const notFound = () => {
      setPendingSelection(null);
      toast(t('toast.selectionNotFound'));
    };

    if (pendingSelection.kind === 'station') {
      if (!stations) return;
      const m = stations.find((s) => s.stationId === pendingSelection.id);
      if (!m) {
        notFound();
        return;
      }
      setSelectedPoint({
        lngLat: [m.lng, m.lat],
        station: {
          stationId: m.stationId,
          stationName: m.stationName,
          country: m.country,
          pm25: m.value,
          measuredAt: m.measuredAt,
        },
      });
      return;
    }

    if (pendingSelection.kind === 'fire') {
      if (!fires) return;
      const idNum = Number(pendingSelection.id);
      const f = Number.isFinite(idNum) ? fires.find((x) => x.id === idNum) : undefined;
      if (!f) {
        notFound();
        return;
      }
      setSelectedPoint({
        lngLat: [f.lng, f.lat],
        fire: {
          id: f.id,
          frp: f.frp,
          confidence: f.confidence,
          detectedAt: f.detectedAt,
          daynight: f.daynight,
        },
      });
      return;
    }

    if (pendingSelection.kind === 'plant') {
      if (!plants) return;
      const idNum = Number(pendingSelection.id);
      const feat = Number.isFinite(idNum)
        ? plants.features.find((x) => x.properties.id === idNum)
        : undefined;
      if (!feat) {
        notFound();
        return;
      }
      const p = feat.properties;
      setSelectedPoint({
        lngLat: [feat.geometry.coordinates[0], feat.geometry.coordinates[1]],
        powerPlant: {
          id: p.id,
          name: p.name,
          fuelType: p.fuel_type,
          capacityMw: p.capacity_mw,
          owner: p.owner,
          commissionedYear: p.commissioned_year,
          country: p.country,
        },
      });
    }
  }, [
    pendingSelection,
    selectedPoint,
    stations,
    fires,
    plants,
    setSelectedPoint,
    setPendingSelection,
    t,
  ]);
}
